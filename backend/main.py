from scanner import NPScanner, SAEItem, FeatureBias
from steerer import NPSteerer
from transformer_lens import HookedTransformer
import transformer_lens
from sae_lens import SAE


model = HookedTransformer.from_pretrained("phi-2", device="cuda:0")
saes:list[SAEItem] = []
for i in range(32):
    saes.append(
        SAEItem(
            None,
            "blocks." + str(i) + ".hook_resid_pre"
        )
    )
scanner = NPScanner(saes=saes, model=model) 

# Test it
positive = [
    "The king sat on his throne",
    "The queen wore her crown",
    "The prince rode his horse",
]
negative = [
    "The programmer wrote some code",
    "The dog ran across the field",
    "The chef cooked a meal",
]   

res = scanner.scan_layers(positive, negative, ["<|endoftext|>"])

print("Without medival steering:")
tokens = model.to_tokens("In the ancient kingdom, the programmer")
output = model.generate(tokens, max_new_tokens=20)
print(model.to_string(output[0]))
print("With medival steering:")
features = [scanner.to_feature_bias(res, 1)]
steerer = NPSteerer(features).hookOnModel(model)
tokens = model.to_tokens("In the ancient kingdom, the programmer")
output = model.generate(tokens, max_new_tokens=20)
print(model.to_string(output[0]))