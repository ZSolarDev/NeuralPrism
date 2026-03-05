from npscanner import NPScanner
from npsteerer import NPSteerer
from npprofile import NPProfile
from transformer_lens import HookedTransformer
import transformer_lens
from sae_lens import SAE


model = HookedTransformer.from_pretrained("phi-2", device="cuda:0")
layerIDs:list[str] = []
for i in range(32):
    layerIDs.append("blocks." + str(i) + ".hook_resid_pre")
scanner = NPScanner(layerIDs=layerIDs, model=model) 

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

print("Saving profile!")
profile = NPProfile(features)
# Neural Prism Bias Profile
profile.save("profile.npbp")
print("Profile saved! Loading profile...")

profile = NPProfile.load("profile.npbp")
print(f"Profile loaded! {len(profile.biases)} biases found!")