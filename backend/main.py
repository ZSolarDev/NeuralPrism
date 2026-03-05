from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformer_lens import HookedTransformer
import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging

from npscanner import NPScanner

logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

app = FastAPI()

# allow React frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# global state
executor = ThreadPoolExecutor(max_workers=1)
model = None
last_task_complete = True

class LoadModelRequest(BaseModel):
    model_name:str

@app.post("/load_model")
async def load_model(req:LoadModelRequest):
    global model, last_task_complete
    last_task_complete = False
    model = HookedTransformer.from_pretrained(
        req.model_name,
        trust_remote_code=True,
        device="cuda",
        dtype="float16"
    )
    last_task_complete = True

@app.get("/status")
def status():
    return {"complete": last_task_complete}

@app.get("/model_info")
def model_info():
    if model is None:
        return {"loaded": False}
    
    cfg = model.cfg
    layer_neurons = []
    
    for i in range(cfg.n_layers):
        layer_neurons.append(cfg.d_model)
    
    return {
        "loaded": True,
        "num_layers": len(layer_neurons),
        "neurons_per_layer": layer_neurons
    }

class ScanRequest(BaseModel):
    pos_inputs: list[str]
    neg_inputs: list[str]
    skip_tokens: list[str] = ["<|endoftext|>"]
    bias: float = 1.0
    name: str = "Unnamed"

@app.post("/scan")
async def scan(req: ScanRequest):
    if model is None:
        return {"error": "Model not loaded"}
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, _scan_sync, req)
    return result

def _scan_sync(req: ScanRequest):
    layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]
    scanner = NPScanner(model=model, layerIDs=layerIDs)
    res = scanner.scan_layers(req.pos_inputs, req.neg_inputs, req.skip_tokens)
    bias = scanner.to_feature_bias(res, req.bias)
    bias.name = req.name
    return {
        "highest_layer": res.highestLayer,
        "layer_diffs": [[n.item() for n in layer] for layer in res.layerDiffs],
        "vector": res.highestFeature.tolist(),
        "name": req.name
    }