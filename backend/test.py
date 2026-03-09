from npscanner import NPScanner
from npsteerer import NPSteerer
from npprofile import NPProfile
from transformer_lens import HookedTransformer
import transformer_lens
from sae_lens import SAE

profile = NPProfile.load("amTest.npbp")
model = HookedTransformer.from_pretrained("phi-1_5", device="cuda:0")
print(next(model.parameters()).device)
# layerIDs:list[str] = []
# for i in range(32):
#     layerIDs.append("blocks." + str(i) + ".hook_resid_pre")
# scanner = NPScanner(layerIDs=layerIDs, model=model) 
# 
# # Test it
# positive = [
#     "The king sat on his throne",
#     "The queen wore her crown",
#     "The prince rode his horse",
# ]
# negative = [
#     "The programmer wrote some code",
#     "The dog ran across the field",
#     "The chef cooked a meal",
# ]   
# 
# res = scanner.scan_layers(positive, negative, ["<|endoftext|>"])
# 
# print("Without medieval steering:")
# tokens = model.to_tokens("In the ancient kingdom, the programmer")
# output = model.generate(tokens, max_new_tokens=20)
# print(model.to_string(output[0]))
# print("With medieval steering:")
# features = [scanner.to_feature_bias(res, 1)]
# steerer = NPSteerer(features).hookOnModel(model)
# tokens = model.to_tokens("In the ancient kingdom, the programmer")
# output = model.generate(tokens, max_new_tokens=20)
# print(model.to_string(output[0]))
# 
# print("Saving profile!")
# profile = NPProfile(features)
# # Neural Prism Bias Profile
# profile.save("profile.npbp")
# print("Profile saved! Loading profile...")
# 
# profile = NPProfile.load("profile.npbp")
# print(f"Profile loaded! {len(profile.biases)} biases found!")

# Load the test profile


steerer = NPSteerer(profile.biases)

prompts = [
    ("formal",  "The committee hereby declares that all members must"),
    ("casual",  "hey i was just thinking about maybe"),
]

for label, prompt in prompts:
    tokens = model.to_tokens(prompt)

    raw_output = model.generate(tokens, max_new_tokens=30)
    raw_continuation = model.to_string(raw_output[0][tokens.shape[1]:]).replace("<|endoftext|>", "")

    steerer.hookOnModel(model)
    steered_output = model.generate(tokens, max_new_tokens=30)
    steered_continuation = model.to_string(steered_output[0][tokens.shape[1]:]).replace("<|endoftext|>", "")
    steerer.unhookFromModel()

    print(f"[{label}]")
    print(f"prompt: {prompt}")
    print(f"raw: {prompt}{raw_continuation}")
    print(f"steered: {prompt}{steered_continuation}")
    print()