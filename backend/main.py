from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformer_lens import HookedTransformer
import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging
import threading

from npscanner import NPScanner

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
    model_name: str

@app.post("/load_model")
async def load_model(req: LoadModelRequest):
    global model
    model = HookedTransformer.from_pretrained(
        req.model_name,
        trust_remote_code=True,
        device="cuda",
        dtype="float16"
    )

@app.get("/model_info")
def model_info():
    if model is None:
        return {"loaded": False}
    cfg = model.cfg
    return {
        "loaded": True,
        "num_layers": cfg.n_layers,
        "neurons_per_layer": [cfg.d_model] * cfg.n_layers
    }

@app.get("/scan_progress")
def get_scan_progress():
    with scan_lock:
        return dict(scan_progress)


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


def _on_progress(current_input: int, total_inputs: int, diffs: list, highest_layer: int, highest_vec: list):
    with scan_lock:
        scan_progress["current_input"] = current_input
        scan_progress["total_inputs"] = total_inputs
        scan_progress["layer_diffs"] = diffs
        scan_progress["highest_layer"] = highest_layer
        scan_progress["vector"] = highest_vec


def _scan_sync(req: ScanRequest):
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