from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from nphfadapter import NPHFAdapter, UnknownArchitectureError
import asyncio
from concurrent.futures import ThreadPoolExecutor
from npprofile import NPProfile
from npscanner import FeatureBias as NPFeatureBias, NPScanner
from npsteerer import NPSteerer
import torch
import io
import logging
import threading
import tempfile
import os

logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=1)
model = None
curModelName = "NONE"

scan_lock = threading.Lock()
scan_progress = {
    "running": False,
    "current_input": 0,
    "total_inputs": 0,
    "layer_diffs": [],
    "highest_layer": 0,
    "vector": [],
    "name": "",
    "done": False,
}


class LoadModelRequest(BaseModel):
    model_name:str
    backend:str = "hf"
    device:str = "cuda"
    dtype:str = "float16"
    layer_path:str = ""
    norm_path:str = ""
    lm_head_path:str = ""

@app.post("/load_model")
async def load_model(req:LoadModelRequest):
    global curModelName, model
    curModelName = req.model_name
    if req.backend == "transformerlens":
        try:
            from transformer_lens import HookedTransformer
            model = HookedTransformer.from_pretrained(
                req.model_name,
                trust_remote_code=True,
                device=req.device,
                dtype=req.dtype,
            )
        except Exception as e:
            return {"error": str(e)}
    else:
        try:
            model = NPHFAdapter.from_pretrained(
                req.model_name,
                device=req.device,
                dtype=req.dtype,
                layer_path=req.layer_path or None,
                norm_path=req.norm_path or None,
                lm_head_path=req.lm_head_path or None,
            )
        except UnknownArchitectureError as e:
            return {
                "error": "unknown_architecture",
                "model_type": e.model_type,
                "discovered": e.discovered,
                "message": str(e),
            }
        except Exception as e:
            return {"error": str(e)}
    return {"ok": True}

@app.get("/model_info")
def model_info():
    if model is None:
        return {"loaded": False}
    cfg = model.cfg
    return {
        "loaded": True,
        "model_name": curModelName,
        "num_layers": cfg.n_layers,
        "neurons_per_layer": [cfg.d_model] * cfg.n_layers
    }

token_scan_state = {
    "running": False,
    "done": False,
    "total_tokens": 0,
    "results": [],
}

class TokenActivationRequest(BaseModel):
    inputs:list[str]

@app.post("/token_activations")
async def token_activations(req:TokenActivationRequest):
    if model is None:
        return {"error": "Model not loaded"}
    if token_scan_state["running"]:
        return {"error": "Token scan already in progress"}

    total_tokens = sum(model.to_tokens(inp).shape[1] for inp in req.inputs)

    with scan_lock:
        token_scan_state.update({
            "running": True,
            "done": False,
            "total_tokens": total_tokens,
            "results": [],
        })

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, _token_activations_sync, req)
    return {"started": True, "total_tokens": total_tokens}

@app.get("/token_activations_progress")
def token_activations_progress():
    with scan_lock:
        return {
            "running": token_scan_state["running"],
            "done": token_scan_state["done"],
            "total_tokens": token_scan_state["total_tokens"],
            "results": token_scan_state["results"],
        }

def _token_activations_sync(req:TokenActivationRequest):
    layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]
    all_results = []

    for inp in req.inputs:
        tokens = model.to_tokens(inp)
        token_ids = tokens[0]
        token_strs = [model.to_string([t]) for t in token_ids]

        layer_acts:dict[int, torch.Tensor] = {}

        def make_hook(layer_idx):
            def hook(value, hook):
                layer_acts[layer_idx] = value[0].detach()
                return value
            return hook

        hooks = [(lid, make_hook(i)) for i, lid in enumerate(layerIDs)]
        model.run_with_hooks(tokens, fwd_hooks=hooks)

        token_data = []
        for tok_idx, tok_str in enumerate(token_strs):
            layers = [
                [v.item() for v in layer_acts[layer_idx][tok_idx]]
                for layer_idx in range(len(layerIDs))
            ]
            token_data.append({"token": tok_str, "data": layers})

        all_results.append(token_data)

    with scan_lock:
        token_scan_state.update({
            "running": False,
            "done": True,
            "results": all_results,
        })

@app.get("/scan_progress")
def get_scan_progress():
    with scan_lock:
        return dict(scan_progress)


class SaveProfileRequest(BaseModel):
    biases:list[dict]

@app.post("/save_profile")
def save_profile(req:SaveProfileRequest):
    biases = []
    for b in req.biases:
        fb = NPFeatureBias(
            vector=torch.tensor(b["vector"], dtype=torch.float32),
            bias=b["bias"],
            layer=b["layer"],
            name=b["name"],
            condition=b["condition"] or None,
        )
        biases.append(fb)
    buf = io.BytesIO()
    NPProfile(biases).save(buf)
    return Response(content=buf.getvalue(), media_type="application/octet-stream")

@app.post("/load_profile")
async def load_profile(file:UploadFile = File(...)):
    contents = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".npbp") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name
    try:
        profile = NPProfile.load(tmp_path)
    finally:
        os.unlink(tmp_path)
    return {
        "biases": [{
            "name": b.name,
            "bias": b.bias,
            "layer": b.layer,
            "condition": b.condition or "",
            "vector": b.vector.tolist(),
        } for b in profile.biases]
    }


class SeparationQualityRequest(BaseModel):
    vector:list[float]
    layer:int
    pos_inputs:list[str]
    neg_inputs:list[str]
    skip_tokens:list[str] = []

@app.post("/separation_quality")
def separation_quality(req:SeparationQualityRequest):
    if model is None:
        return {"error": "Model not loaded"}
    layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]
    scanner = NPScanner(model=model, layerIDs=layerIDs)
    vector = torch.tensor(req.vector, dtype=torch.float32)
    result = scanner.separation_quality(
        vector,
        req.layer,
        req.pos_inputs,
        req.neg_inputs,
        req.skip_tokens
    )
    return {
        "quality": result.quality,
        "avg_pos": result.avg_pos,
        "avg_neg": result.avg_neg,
        "pos_sims": result.pos_sims,
        "neg_sims": result.neg_sims,
    }


class ScanRequest(BaseModel):
    pos_inputs:list[str]
    neg_inputs:list[str]
    skip_tokens:list[str] = ["<|endoftext|>"]
    bias:float = 1.0
    name:str = "Unnamed"

@app.post("/scan")
async def scan(req:ScanRequest):
    if model is None:
        return {"error": "Model not loaded"}
    if scan_progress["running"]:
        return {"error": "Scan already in progress"}

    with scan_lock:
        scan_progress.update({
            "running": True,
            "current_input": 0,
            "total_inputs": len(req.pos_inputs) + len(req.neg_inputs),
            "layer_diffs": [],
            "highest_layer": 0,
            "vector": [],
            "name": req.name,
            "done": False,
        })

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, _scan_sync, req)
    return {"started": True}


def _on_progress(current_input:int, total_inputs:int, diffs:list, highest_layer:int, highest_vec:list):
    with scan_lock:
        scan_progress["current_input"] = current_input
        scan_progress["total_inputs"] = total_inputs
        scan_progress["layer_diffs"] = diffs
        scan_progress["highest_layer"] = highest_layer
        scan_progress["vector"] = highest_vec


def _scan_sync(req:ScanRequest):
    layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]
    scanner = NPScanner(model=model, layerIDs=layerIDs)

    res = scanner.scan_layers(
        req.pos_inputs,
        req.neg_inputs,
        req.skip_tokens,
        on_progress=_on_progress,
    )

    final_diffs = [[n.item() for n in layer] for layer in res.layerDiffs]
    final_vec = res.highestFeature.tolist()

    with scan_lock:
        scan_progress.update({
            "running": False,
            "done": True,
            "layer_diffs": final_diffs,
            "highest_layer": res.highestLayer,
            "vector": final_vec,
        })

    return {
        "highest_layer": res.highestLayer,
        "layer_diffs": final_diffs,
        "vector": final_vec,
        "name": req.name,
    }

class LogitLensRequest(BaseModel):
    token_index:int
    input_text:str
    top_k:int = 3

@app.post("/logit_lens")
def logit_lens(req:LogitLensRequest):
    if model is None:
        return {"error": "Model not loaded"}

    tokens = model.to_tokens(req.input_text)
    layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]

    layer_acts:dict[int, torch.Tensor] = {}

    def make_hook(layer_idx):
        def hook(value, hook):
            layer_acts[layer_idx] = value[0, req.token_index].detach().float()
            return value
        return hook

    hooks = [(lid, make_hook(i)) for i, lid in enumerate(layerIDs)]
    model.run_with_hooks(tokens, fwd_hooks=hooks)

    results = []
    for i in range(model.cfg.n_layers):
        resid = layer_acts[i].unsqueeze(0)
        resid_normed = model.ln_final(resid)
        logits = model.unembed(resid_normed)[0]
        probs = torch.softmax(logits, dim=-1)
        topk = torch.topk(probs, req.top_k)
        top = [
            {"token": model.to_string([topk.indices[j].item()]), "prob": topk.values[j].item()}
            for j in range(req.top_k)
        ]
        results.append({"layer": i, "top": top})

    return {"layers": results}


inference_state = {
    "running": False,
    "done": False,
    "cancelled": False,
    "tokens": [],
    "logit_lens": [],
    "prompt_length": 0,
}

class InferenceBias(BaseModel):
    vector:list[float]
    bias:float
    layer:int
    name:str
    condition:str = ""

class InferenceRequest(BaseModel):
    prompt:str
    biases:list[InferenceBias]
    max_tokens:int | None = None

@app.post("/inference")
async def inference(req:InferenceRequest):
    if model is None:
        return {"error": "Model not loaded"}
    if inference_state["running"]:
        return {"error": "Inference already running"}

    with scan_lock:
        inference_state.update({
            "running": True,
            "done": False,
            "cancelled": False,
            "tokens": [],
            "logit_lens": [],
            "prompt_length": 0,
        })

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, _inference_sync, req)
    return {"started": True}

@app.post("/inference_cancel")
def inference_cancel():
    with scan_lock:
        if not inference_state["running"]:
            return {"error": "No inference running"}
        inference_state["cancelled"] = True
    return {"cancelled": True}

@app.get("/inference_progress")
def inference_progress():
    with scan_lock:
        return {
            "running": inference_state["running"],
            "done": inference_state["done"],
            "cancelled": inference_state["cancelled"],
            "tokens": inference_state["tokens"],
            "logit_lens": inference_state["logit_lens"],
            "prompt_length": inference_state["prompt_length"],
        }

def _inference_sync(req:InferenceRequest):
    feature_biases = []
    for b in req.biases:
        fb = NPFeatureBias(
            vector=torch.tensor(b.vector, dtype=torch.float16).to(model.cfg.device),
            bias=b.bias,
            layer=b.layer,
            name=b.name,
            condition=b.condition or None,
        )
        feature_biases.append(fb)

    steerer = NPSteerer(feature_biases)
    steerer.hookOnModel(model, unhook=False)

    try:
        tokens = model.to_tokens(req.prompt)
        prompt_length = tokens.shape[1]

        with scan_lock:
            inference_state["prompt_length"] = prompt_length

        max_tokens = req.max_tokens if req.max_tokens is not None else 200
        layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]

        for _ in range(max_tokens):
            with scan_lock:
                if inference_state["cancelled"]:
                    break

            layer_acts:dict[int, torch.Tensor] = {}

            def make_lens_hook(layer_idx):
                def hook(value, hook):
                    layer_acts[layer_idx] = value[0, -1].detach().float()
                    return value
                return hook

            lens_hooks = [(lid, make_lens_hook(i)) for i, lid in enumerate(layerIDs)]

            with torch.no_grad():
                logits = model.run_with_hooks(tokens, fwd_hooks=lens_hooks)

            next_token_logits = logits[0, -1]
            next_token = next_token_logits.argmax(dim=-1).unsqueeze(0).unsqueeze(0)
            token_str = model.to_string([next_token.item()])

            layer_preds = []
            for i in range(model.cfg.n_layers):
                resid = layer_acts[i].unsqueeze(0)
                resid_normed = model.ln_final(resid)
                layer_logits = model.unembed(resid_normed)[0]
                probs = torch.softmax(layer_logits, dim=-1)
                topk = torch.topk(probs, 3)
                top = [
                    {"token": model.to_string([topk.indices[j].item()]), "prob": topk.values[j].item()}
                    for j in range(3)
                ]
                layer_preds.append({"layer": i, "top": top})

            with scan_lock:
                inference_state["tokens"].append(token_str)
                inference_state["logit_lens"].append(layer_preds)

            tokens = torch.cat([tokens, next_token], dim=1)

            eos_id = model.tokenizer.eos_token_id
            if eos_id is not None and next_token.item() == eos_id:
                break

    finally:
        steerer.unhookFromModel()
        with scan_lock:
            inference_state["running"] = False
            inference_state["done"] = True