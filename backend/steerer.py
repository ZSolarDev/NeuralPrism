from scanner import NPScanner, FeatureBias
from transformer_lens import HookedTransformer

class NPSteerer:
    def __init__(self, feature_biases:list[FeatureBias],):
        self.biases = feature_biases
        self.curHandles = []
        self.model = None
        
    def model_fwd(self, layer:int):
        def hook(module, input, output):
            for bias in self.biases:
                if bias.layer == layer:
                    output += bias.vector * bias.bias
            return output
        return hook
    
    
    def hookOnModel(self, model:HookedTransformer) -> "NPSteerer":
        self.unhookFromModel()
        self.model = model
        biases_by_layer = {}
        for bias in self.biases:
            if bias.layer not in biases_by_layer:
                biases_by_layer[bias.layer] = []
            biases_by_layer[bias.layer].append(bias)
            
        # only hook layers that have biases
        for layer, biases in biases_by_layer.items():
            def make_hook(fBiases:list[FeatureBias]):
                def hook(module, input, output):
                    for bias in fBiases:
                        output += bias.vector * bias.bias
                    return output
                return hook
            self.curHandles.append(
                model.blocks[layer].hook_resid_pre.register_forward_hook(make_hook(biases))
            )
        return self
    
    def unhookFromModel(self):
        for handle in self.curHandles:
            handle.remove()
        self.curHandles.clear()
        self.model = None
        
    