from npscanner import FeatureBias
from safetensors.torch import save_file, safe_open, save as safetensors_save

class NPProfile:
    """
    A savable and loadable list of feature biases.
    """
    def __init__(self, biases:list[FeatureBias]):
        self.biases = biases
        
    def save(self, path):
        """
        Saves this profile to the given path via safetensors.
        """
        tensors = {}
        metadata = {}
        for i, b in enumerate(self.biases):
            tensors[str(i)] = b.vector
            metadata[f"{i}_name"] = b.name
            metadata[f"{i}_bias"] = str(b.bias)
            metadata[f"{i}_layer"] = str(b.layer)
            metadata[f"{i}_condition"] = b.condition or ""

        data = safetensors_save(tensors, metadata)
        if isinstance(path, (str, bytes)):
            with open(path, "wb") as f: f.write(data)
        else:
            path.write(data)
        
    @classmethod
    def load(cls, path:str):
        """
        Loads a profile from the given path via safetensors.
        """
        with safe_open(path, framework="pt") as f:
            metadata:dict[str, str] = f.metadata()
            tensors = {k: f.get_tensor(k) for k in f.keys()}
        biases = []
        for i in range(len(tensors.keys())):
            condition_str = metadata.get(f"{i}_condition", "")
            bias = FeatureBias(
                tensors[str(i)],
                float(metadata[f"{i}_bias"]),
                int(metadata[f"{i}_layer"]),
                metadata[f"{i}_name"],
                condition=condition_str if condition_str else None,
            )
            biases.append(bias)
        return cls(biases)
        