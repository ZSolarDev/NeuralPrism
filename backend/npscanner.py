from torch import Tensor
import torch
from transformer_lens import HookedTransformer, ActivationCache
from dataclasses import dataclass
from typing import Callable, Optional

@dataclass
class FeatureBias:
    """
    A FeatureBias is a feature vector, the layer its on, the SAE, and its bias multiplier.
    The bias multiplier is used to increase or decrease the strength of the feature.
    
    Attributes:
        vector (Tensor): The feature
        bias (float): The bias
        layer (int): The layer
        name (str): The name
        condition (str | None): Boolean expression over bias indices, e.g. "(0 AND 1) OR 2". None means unconditional.
        condition_threshold (float): Cosine similarity threshold for condition checks. Defaults to 0.3.
    """
    vector:Tensor
    bias:float
    layer:int
    name:str
    condition:str | None = None
    condition_threshold:float = 0.3

@dataclass
class NPScanResult:
    """
    The result of NPScanner.scan_layers().
    
    Attributes:
        layerDiffs (list[list[Tensor]]): List of neuron differences in each layer
        highestLayer (int): Index of highest layer
        highestFeature (Tensor): highest layer feature
    """
    layerDiffs:list[list[Tensor]]
    highestLayer:int
    highestFeature:Tensor

# (current_input, total_inputs, layer_diffs_so_far, highest_layer, highest_vector)
ProgressCallback = Callable[[int, int, list[list[float]], int, list[float]], None]

class NPScanner:
    """
    an NPSCanner can scan each layer for the highest activation difference based on what should activate(positive) and what should not activate(negative).
    This can be used to find the layer that best represents whats in the positive inputs, as well as its score and all other layers score differences.
    You can insert this difference vector into an NPSteerer to steer the model in the direction of the difference vector.
    """
    def __init__(self, model:HookedTransformer, layerIDs:list[str]):
        self.model = model
        self.layerIDs = layerIDs

    def _run_input(self, inp:str, skip_tokens:list[str]) -> list[Tensor]:
        """
        Runs one input through the model via hooks.
        Returns a list of mean activations, one tensor per layer.
        
        Args:
            inp (str): The input
            skip_tokens (list[str]): List of tokens to skip
        
        Returns:
            list[Tensor]
        """
        tokens = self.model.to_tokens(inp)
        token_ids = tokens[0]
        skip_ids = {self.model.to_single_token(t) for t in skip_tokens}
        mask = torch.tensor([t.item() not in skip_ids for t in token_ids])

        layer_acts:dict[int, Tensor] = {}

        def make_hook(layer_idx):
            def hook(value, hook):
                acts = value[0][mask]
                layer_acts[layer_idx] = acts.mean(dim=0).detach()
                return value
            return hook

        hooks = [(lid, make_hook(i)) for i, lid in enumerate(self.layerIDs)]
        self.model.run_with_hooks(tokens, fwd_hooks=hooks)

        return [layer_acts[i] for i in range(len(self.layerIDs))]

    def _compute_current_diffs(
        self,
        pos_sums:list[Optional[Tensor]],
        neg_sums:list[Optional[Tensor]],
        pos_count:int,
        neg_count:int,
    ) -> tuple[list[list[float]], int, list[float]]:
        """
        Computes diff vectors from current running sums.
        Layers where either side has no data yet are returned as [].
        
        Args:
            pos_sums (list[Optional[Tensor]]): Running sum of positive activations per layer
            neg_sums (list[Optional[Tensor]]): Running sum of negative activations per layer
            pos_count (int): Number of positive inputs processed so far
            neg_count (int): Number of negative inputs processed so far
        
        Returns:
            tuple[list[list[float]], int, list[float]]
        """
        diffs = []
        highest_layer = 0
        highest_feature:Optional[Tensor] = None

        for i in range(len(self.layerIDs)):
            if pos_sums[i] is None or neg_sums[i] is None or pos_count == 0 or neg_count == 0:
                diffs.append([])
                continue
            diff = (pos_sums[i] / pos_count) - (neg_sums[i] / neg_count)
            diffs.append([v.item() for v in diff])
            if highest_feature is None or diff.norm().item() > highest_feature.norm().item():
                highest_feature = diff
                highest_layer = i

        highest_vec = highest_feature.tolist() if highest_feature is not None else []
        return diffs, highest_layer, highest_vec

    def scan_layers(self, pos_inputs:list[str], neg_inputs:list[str], skip_tokens:list[str], on_progress:Optional[ProgressCallback] = None) -> NPScanResult:
        """
        Scans each layer and returns the highest activation difference.
        
        Args:
            pos_inputs (list[str]): List of positive inputs
            neg_inputs (list[str]): List of negative inputs
            skip_tokens (list[str]): List of tokens to skip
            on_progress (ProgressCallback | None): Optional callback fired after each input with partial results
            
        Returns:
            NPScanResult
        """
        numLayers = len(self.layerIDs)
        total_inputs = len(pos_inputs) + len(neg_inputs)

        pos_sums:list[Optional[Tensor]] = [None] * numLayers
        neg_sums:list[Optional[Tensor]] = [None] * numLayers
        pos_count = 0
        neg_count = 0

        # Process positives
        for i, inp in enumerate(pos_inputs):
            acts = self._run_input(inp, skip_tokens)
            for layer_idx, act in enumerate(acts):
                if pos_sums[layer_idx] is None:
                    pos_sums[layer_idx] = act.clone()
                else:
                    pos_sums[layer_idx] += act
            pos_count += 1

            if on_progress is not None:
                diffs, highest_layer, highest_vec = self._compute_current_diffs(
                    pos_sums, neg_sums, pos_count, neg_count
                )
                on_progress(i + 1, total_inputs, diffs, highest_layer, highest_vec)

        # Process negatives
        for i, inp in enumerate(neg_inputs):
            acts = self._run_input(inp, skip_tokens)
            for layer_idx, act in enumerate(acts):
                if neg_sums[layer_idx] is None:
                    neg_sums[layer_idx] = act.clone()
                else:
                    neg_sums[layer_idx] += act
            neg_count += 1

            if on_progress is not None:
                diffs, highest_layer, highest_vec = self._compute_current_diffs(
                    pos_sums, neg_sums, pos_count, neg_count
                )
                on_progress(len(pos_inputs) + i + 1, total_inputs, diffs, highest_layer, highest_vec)

        # Final result as tensors
        layer_diffs_tensors = []
        highest_layer = 0
        highest_feature:Optional[Tensor] = None

        for i in range(numLayers):
            diff = (pos_sums[i] / pos_count) - (neg_sums[i] / neg_count)
            layer_diffs_tensors.append([diff[j] for j in range(diff.shape[0])])
            if highest_feature is None or diff.norm().item() > highest_feature.norm().item():
                highest_feature = diff
                highest_layer = i

        return NPScanResult(layer_diffs_tensors, highest_layer, highest_feature)

    def to_feature_bias(self, scanRes:NPScanResult, bias:float = 1.0) -> FeatureBias:
        """
        Converts an NPScanResult to a FeatureBias.
        
        Args:
            scanRes (NPScanResult): The result of NPScanner.scan_layers().
            bias (float, optional): The bias of the feature. Defaults to 1.0.
        
        Returns:
            FeatureBias
        """
        return FeatureBias(scanRes.highestFeature, bias, scanRes.highestLayer, "Unnamed")