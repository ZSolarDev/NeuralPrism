from npscanner import NPScanner, FeatureBias
from transformer_lens import HookedTransformer
import torch.nn.functional as F
from torch import Tensor
import re
class NPSteerer:
    """
    Steers the currently hooked model in the direction * bias of all FeatureBias in the biases array.
    """
    def __init__(self, biases:list[FeatureBias]):
        self.biases = biases
        self.curHandles = []
        self.model = None
    
    def evaluate_condition(self, expr:str, biases:list[FeatureBias], residual:Tensor) -> bool:
        def check(idx:int, threshold:float) -> bool:
            vec = biases[idx].vector
            resid_mean = residual[0].mean(dim=0)
            sim = F.cosine_similarity(resid_mean.unsqueeze(0), vec.unsqueeze(0))
            return sim.item() > threshold

        def replace_index(match):
            idx = int(match.group(1))
            threshold = float(match.group(2)) if match.group(2) is not None else 0.3
            return str(check(idx, threshold))
        
        evaluated = re.sub(r'(\d+)(?:\[(-?[\d.]+)\])?', replace_index, expr)
        evaluated = evaluated.replace("AND", "and").replace("OR", "or").replace("NOT", "not")
        return eval(evaluated)
    
    
    def hookOnModel(self, model:HookedTransformer, unhook:bool = True) -> "NPSteerer":
        """
        Hooks this steerer on the model.
        
        Args:
            model (HookedTransformer): The model to hook on.
            unhook (bool, optional): Whether to unhook from the previous model. Defaults to True.
            
        Returns:
            NPSteerer: For chaining.
        """
        if unhook:
            self.unhookFromModel()
        self.model = model
        biasesByLayer = {}
        for bias in self.biases:
            bias.vector = bias.vector.to(model.cfg.device)
            if bias.layer not in biasesByLayer:
                biasesByLayer[bias.layer] = []
            biasesByLayer[bias.layer].append(bias)
            
        # only hook layers that have biases
        for layer, biases in biasesByLayer.items():
            def make_hook(fBiases:list[FeatureBias]):
                def hook(module, input, output):
                    resid = input[0]
                    for bias in fBiases:
                        if bias.condition is None or self.evaluate_condition(bias.condition, self.biases, resid):
                            output += bias.vector * 0.5
                    return output
                return hook
            self.curHandles.append(
                model.blocks[layer].hook_resid_pre.register_forward_hook(make_hook(biases))
            )
        return self
    
    def unhookFromModel(self):
        """
        Unhooks this steerer from the currently hooked model.
        """
        for handle in self.curHandles:
            handle.remove()
        self.curHandles.clear()
        self.model = None
        
    