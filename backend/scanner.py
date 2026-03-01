from sae_lens import SAE
from torch import Tensor
import torch
from transformer_lens import HookedTransformer, ActivationCache
from dataclasses import dataclass

@dataclass
class FeatureBias:
    """
    A FeatureBias is a feature vector, the layer its on, the SAE, and its bias multiplier.
    The bias multiplier is used to increase or decrease the strength of the feature.
    
    Attributes:
        vector (Tensor): The feature
        bias (float): The bias
        layer (int): The layer
    """
    vector:Tensor
    bias:float
    layer:int
    
@dataclass
class NPScanResult:
    """
    The result of NPScanner.scan_layers().
    
    Attributes:
        layerDiffs (list[Tensor]): List of layer differences
        highestLayer (int): Index of highest layer
        highestFeature (Tensor): highest layer feature
    """
    layerDiffs:list[Tensor]
    highestLayer:int
    highestFeature:Tensor

class NPScanner:
    def __init__(self, model:HookedTransformer, layerIDs:list[str]):
        self.model = model
        self.layerIDs = layerIDs
    
    def get_activations(self, input:str, cache:ActivationCache, layer:int, skip_tokens:list[str]) -> Tensor:
        """
        Gets activations for an input at a given layer, skipping tokens in skip_tokens.
        
        Args:
            input (str): The input
            layer (int): The layer
            skip_tokens (list[str]): List of tokens to skip
        
        Returns:
            Tensor
        """
        saes = self.saes
        if not (-len(saes) <= layer < len(saes)):
            raise IndexError("SAE Layer " + str(layer) + " is out of range! There are only " + str(len(saes)) + " SAE layers!")
        sae = self.saes[layer]
        model = self.model
        # Tokenize input
        tokens = model.to_tokens(input)
        token_ids = tokens[0]
        # Skip tokens via boolean mask
        skip_ids = [model.to_single_token(t) for t in skip_tokens]
        mask = torch.tensor([t.item() not in skip_ids for t in token_ids])
        # load activations
        acts = cache[sae.id]
        # Get mean/run mask
        acts = acts[0]
        acts = acts[mask]
        return acts.mean(dim=0)
    
    def scan_layers(self, pos_inputs:list[str], neg_inputs:list[str], skip_tokens:list[str]) -> NPScanResult:
        """
        Scan each layer for the highest activation difference based on what should activate(positive) and what should not activate(negative).
        This can be used to find the layer that best represents whats in the positive inputs, as well as its score and all other layers score differences.
        
        Args:
            pos_inputs (list[str]): List of positive inputs
            neg_inputs (list[str]): List of negative inputs
            skip_tokens (list[str]): List of tokens to skip
            
        Returns:
            NPScanResult
        """
        numLayers = len(self.saes)
        layer_diffs:list[Tensor] = []
        pos_caches:list[ActivationCache] = [self.model.run_with_cache(self.model.to_tokens(input))[1] for input in pos_inputs]
        neg_caches:list[ActivationCache] = [self.model.run_with_cache(self.model.to_tokens(input))[1] for input in neg_inputs]
        # For each layer...
        for layer in range(numLayers):
            pos_features:list[Tensor] = []
            neg_features:list[Tensor] = []
            # ...get mean positive and negative activations, and...
            for i in range(len(pos_caches)):
                input = pos_inputs[i]
                cache = pos_caches[i]
                pos_features.append(self.get_activations(input, cache, layer, skip_tokens))
            pos_mean:Tensor = torch.stack(pos_features).mean(dim=0)
            for i in range(len(neg_caches)):
                input = neg_inputs[i]
                cache = neg_caches[i]
                neg_features.append(self.get_activations(input, cache, layer, skip_tokens))
            neg_mean:Tensor = torch.stack(neg_features).mean(dim=0)
            # ...calculate and append the difference between them.
            diff = pos_mean - neg_mean
            layer_diffs.append(diff)
        # Find highest layer
        highest_layer = 0
        highest_feature = None
        for i, diff in enumerate(layer_diffs):
            feature = diff
            if (highest_feature is None):
                highest_feature = feature
                continue
            if feature.norm().item() > highest_feature.norm().item():
                highest_feature = feature
                highest_layer = i
        return NPScanResult(layer_diffs, highest_layer, highest_feature)
    
    def to_feature_bias(self, scanRes:NPScanResult, bias:float = 1.0) -> FeatureBias:
        """
        Converts an NPScanResult to a FeatureBias.
        
        Args:
            scanRes (NPScanResult): The result of NPScanner.scan_layers().
            bias (float, optional): The bias of the feature. Defaults to 1.0.
        
        Returns:
            FeatureBias
        """
        return FeatureBias(scanRes.highestFeature, bias, scanRes.highestLayer)
    
    def get_ids(self) -> list[str]:
        return [sae.id for sae in self.saes]