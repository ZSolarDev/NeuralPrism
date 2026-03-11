from __future__ import annotations

import re
import torch
from torch import Tensor
from typing import Callable, Optional
from transformers import AutoModelForCausalLM, AutoTokenizer, PreTrainedModel, PreTrainedTokenizerBase
from dataclasses import dataclass


def _get_attr(obj, dotted_path:str):
    for part in dotted_path.split("."):
        obj = getattr(obj, part)
    return obj


def _autodetect_from_structure(hf_model:PreTrainedModel) -> tuple[str, str, str]:
    named = dict(hf_model.named_modules())

    # find the transformer block list - largest ModuleList where all children are the same type
    layers_path = None
    best_count = 0
    for name, mod in named.items():
        if isinstance(mod, torch.nn.ModuleList) and len(mod) > best_count:
            types = {type(c) for c in mod}
            if len(types) == 1:
                best_count = len(mod)
                layers_path = name

    # find the final layer norm
    norm_path = None
    norm_candidates = []
    for name, mod in named.items():
        cls = type(mod).__name__.lower()
        if any(k in cls for k in ("layernorm", "rmsnorm", "groupnorm")):
            norm_candidates.append(name)
    for candidate in norm_candidates:
        n = candidate.lower()
        if any(k in n for k in ("final", "ln_f", "ln_norm")):
            norm_path = candidate
            break
    if norm_path is None and norm_candidates:
        norm_path = sorted(norm_candidates, key=lambda x: (x.count("."), x))[-1]

    # find lm_head
    lm_head_path = None
    for candidate in ("lm_head", "embed_out", "output", "head"):
        if candidate in named:
            lm_head_path = candidate
            break

    if layers_path and norm_path and lm_head_path:
        return layers_path, norm_path, lm_head_path

    all_names = [
        n for n, m in named.items()
        if isinstance(m, (torch.nn.ModuleList, torch.nn.LayerNorm, torch.nn.Linear))
        and "." not in n.replace("model.", "").replace("transformer.", "")
    ]
    raise UnknownArchitectureError(hf_model.config.model_type, all_names)


class UnknownArchitectureError(Exception):
    def __init__(self, model_type:str, discovered:list[str]):
        self.model_type = model_type
        self.discovered = discovered
        super().__init__(
            f"Cannot auto-detect architecture for model_type='{model_type}'. "
            f"Pass layer_path, norm_path, lm_head_path explicitly. "
            f"Top-level modules found: {discovered}"
        )


@dataclass
class _NPHFConfig:
    n_layers:int
    d_model:int
    device:str
    model_type:str


class NPHFAdapter:
    """
    Wraps a HuggingFace CausalLM to expose the same interface that
    NPScanner, NPSteerer, and the server expect from a HookedTransformer.

    Mirrored attributes/methods:
      cfg, tokenizer, to_tokens, to_string, to_single_token,
      run_with_hooks, ln_final, unembed, blocks
    """

    def __init__(
        self,
        hf_model:PreTrainedModel,
        tokenizer:PreTrainedTokenizerBase,
        layer_path:Optional[str] = None,
        norm_path:Optional[str] = None,
        lm_head_path:Optional[str] = None,
        device:str = "cpu",
    ):
        self._model = hf_model
        self.tokenizer = tokenizer

        if layer_path is None:
            layer_path, norm_path, lm_head_path = _autodetect_from_structure(hf_model)

        self._layers:torch.nn.ModuleList = _get_attr(hf_model, layer_path)
        self._norm:torch.nn.Module = _get_attr(hf_model, norm_path)
        self._lm_head:torch.nn.Module = _get_attr(hf_model, lm_head_path)

        self.cfg = _NPHFConfig(
            n_layers=len(self._layers),
            d_model=hf_model.config.hidden_size,
            device=device,
            model_type=hf_model.config.model_type,
        )

        self.blocks = [_BlockShim(layer) for layer in self._layers]

    @classmethod
    def from_pretrained(
        cls,
        model_name:str,
        device:str = "cuda",
        dtype:str = "float16",
        layer_path:Optional[str] = None,
        norm_path:Optional[str] = None,
        lm_head_path:Optional[str] = None,
        **hf_kwargs,
    ) -> "NPHFAdapter":
        torch_dtype = {
            "float16": torch.float16,
            "bfloat16": torch.bfloat16,
            "float32": torch.float32,
        }.get(dtype, torch.float16)

        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        hf_model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch_dtype,
            device_map=device,
            trust_remote_code=True,
            **hf_kwargs,
        )
        hf_model.eval()

        return cls(hf_model, tokenizer, layer_path, norm_path, lm_head_path, device=device)

    def to_tokens(self, text:str) -> Tensor:
        enc = self.tokenizer(text, return_tensors="pt")
        return enc["input_ids"].to(self.cfg.device)

    def to_string(self, token_ids:list[int]) -> str:
        return self.tokenizer.decode(token_ids, skip_special_tokens=False)

    def to_single_token(self, text:str) -> int:
        ids = self.tokenizer.encode(text, add_special_tokens=False)
        if len(ids) != 1:
            raise ValueError(f"'{text}' encodes to {len(ids)} tokens, expected 1")
        return ids[0]

    def run_with_hooks(self, tokens:Tensor, fwd_hooks:list[tuple[str, Callable]]) -> Tensor:
        handles = []
        layer_hooks:dict[int, list[Callable]] = {}

        for name, fn in fwd_hooks:
            m = re.match(r"blocks\.(\d+)\.hook_resid_pre", name)
            if m:
                idx = int(m.group(1))
                layer_hooks.setdefault(idx, []).append(fn)

        for layer_idx, fns in layer_hooks.items():
            layer = self._layers[layer_idx]

            def make_hf_hook(tl_fns, lidx):
                def hf_hook(module, args, output):
                    if isinstance(output, tuple):
                        hidden = output[0]
                        rest = output[1:]
                    else:
                        hidden = output
                        rest = None
                    for tl_fn in tl_fns:
                        hidden = tl_fn(hidden, None)
                    return (hidden,) + rest if rest is not None else hidden
                return hf_hook

            handles.append(layer.register_forward_hook(make_hf_hook(fns, layer_idx)))

        try:
            with torch.no_grad():
                out = self._model(tokens)
            return out.logits
        finally:
            for h in handles:
                h.remove()

    def ln_final(self, resid:Tensor) -> Tensor:
        return self._norm(resid.to(self._norm.weight.dtype))

    def unembed(self, normed:Tensor) -> Tensor:
        return self._lm_head(normed.to(self._lm_head.weight.dtype))


class _HookResidPre:
    def __init__(self, layer:torch.nn.Module):
        self._layer = layer

    def register_forward_hook(self, fn:Callable):
        def wrapped_hook(module, args, output):
            if isinstance(output, tuple):
                hidden = output[0]
                rest = output[1:]
            else:
                hidden = output
                rest = None
            result = fn(module, args, hidden)
            if result is not None:
                hidden = result
            return (hidden,) + rest if rest is not None else hidden
        return self._layer.register_forward_hook(wrapped_hook)


class _BlockShim:
    def __init__(self, layer:torch.nn.Module):
        self.hook_resid_pre = _HookResidPre(layer)