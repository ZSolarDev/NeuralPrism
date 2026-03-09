from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformer_lens import HookedTransformer
import asyncio
from concurrent.futures import ThreadPoolExecutor
from npprofile import NPProfile
from npscanner import FeatureBias as NPFeatureBias, NPScanner
import torch
import io
import logging
import threading
import tempfile
import os

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
curModelName = "NONE"

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
    global curModelName
    curModelName = req.model_name
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
        "model_name": curModelName,
        "num_layers": cfg.n_layers,
        "neurons_per_layer": [cfg.d_model] * cfg.n_layers
    }
    
token_scan_state = {
    "running": False,
    "done": False,
    "current_input": 0,
    "total_inputs": 0,
    "results": [],
}

class TokenActivationRequest(BaseModel):
    inputs:list[str]

@app.post("/token_activations")
async def token_activations(req:TokenActivationRequest):
    if model is None:
        return {"error": "Model not loaded"}
    if token_scan_state["running"]:
        return {"error": "Token scan already in progress"}

    with scan_lock:
        token_scan_state.update({
            "running": True,
            "done": False,
            "current_input": 0,
            "total_inputs": len(req.inputs),
            "results": [],
        })

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, _token_activations_sync, req)
    return {"started": True}

@app.get("/token_activations_progress")
def token_activations_progress():
    with scan_lock:
        return {
            "running": token_scan_state["running"],
            "done": token_scan_state["done"],
            "current_input": token_scan_state["current_input"],
            "total_inputs": token_scan_state["total_inputs"],
            "results": token_scan_state["results"],
        }

def _token_activations_sync(req:TokenActivationRequest):
    layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]
    scanner = NPScanner(model=model, layerIDs=layerIDs)

    def on_progress(current, total, results, _, __):
        with scan_lock:
            token_scan_state.update({
                "current_input": current,
                "results": results,
            })

    results = scanner.scan_tokens(req.inputs, on_progress=on_progress)

    with scan_lock:
        token_scan_state.update({
            "running": False,
            "done": True,
            "results": results,
        })

@app.get("/scan_progress")
def get_scan_progress():
    with scan_lock:
        return dict(scan_progress)


class SaveProfileRequest(BaseModel):
    biases: list[dict]

@app.post("/save_profile")
def save_profile(req: SaveProfileRequest):
    from fastapi.responses import Response
    biases = []
    for b in req.biases:
        fb = NPFeatureBias(
            vector=torch.tensor(b["vector"], dtype=torch.float32),
            bias=b["bias"],
            layer=b["layer"],
            name=b["name"],
            condition=b["condition"] or None,
        )
        biases.append(fb)
    
    buf = io.BytesIO()
    NPProfile(biases).save(buf)
    return Response(content=buf.getvalue(), media_type="application/octet-stream")

@app.post("/load_profile")
async def load_profile(file: UploadFile = File(...)):
    contents = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".npbp") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name
    try:
        profile = NPProfile.load(tmp_path)
    finally:
        os.unlink(tmp_path)
    return {
        "biases": [{
            "name": b.name,
            "bias": b.bias,
            "layer": b.layer,
            "condition": b.condition or "",
            "vector": b.vector.tolist(),
        } for b in profile.biases]
    }


class SeparationQualityRequest(BaseModel):
    vector:list[float]
    layer:int
    pos_inputs:list[str]
    neg_inputs:list[str]
    skip_tokens:list[str] = []

@app.post("/separation_quality")
def separation_quality(req: SeparationQualityRequest):
    if model is None:
        return {"error": "Model not loaded"}
    layerIDs = [f"blocks.{i}.hook_resid_pre" for i in range(model.cfg.n_layers)]
    scanner = NPScanner(model=model, layerIDs=layerIDs)
    vector = torch.tensor(req.vector, dtype=torch.float32)
    result = scanner.separation_quality(
        vector,
        req.layer,
        req.pos_inputs,
        req.neg_inputs,
        req.skip_tokens
    )
    return {
        "quality": result.quality,
        "avg_pos": result.avg_pos,
        "avg_neg": result.avg_neg,
        "pos_sims": result.pos_sims,
        "neg_sims": result.neg_sims,
    }


class ScanRequest(BaseModel):
    pos_inputs:list[str]
    neg_inputs:list[str]
    skip_tokens:list[str] = ["<|endoftext|>"]
    bias:float = 1.0
    name:str = "Unnamed"

@app.post("/scan")
async def scan(req:ScanRequest):
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


def _on_progress(current_input:int, total_inputs:int, diffs:list, highest_layer:int, highest_vec:list):
    with scan_lock:
        scan_progress["current_input"] = current_input
        scan_progress["total_inputs"] = total_inputs
        scan_progress["layer_diffs"] = diffs
        scan_progress["highest_layer"] = highest_layer
        scan_progress["vector"] = highest_vec


def _scan_sync(req:ScanRequest):
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