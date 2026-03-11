export class Model {
    public loaded:boolean = false
    public name:string = "NONE"
    public numLayers:number = 0
    public neuronsPerLayer:number[] = []
}

export type Tensor = number[]

export class FeatureBias {
    public vector:Tensor = []
    public bias:number = 0.0
    public layer:number = 0
    public name:string = ""
    public condition:string = ""
    public layer_diffs:number[][] = []
}

export type SeparationQuality = {
    quality:number
    avg_pos:number
    avg_neg:number
    pos_sims:number[]
    neg_sims:number[]
}

export type TokenActivationResult = {
    token:string
    data:number[][]
}

export type LayerPrediction = {
    layer:number
    top:{ token:string, prob:number }[]
}

export type ScanResult = {
    name:string
    highest_layer:number
    layer_diffs:number[][]
    vector:Tensor
}

export type ScanProgress = {
    running:boolean
    done:boolean
    current_input:number
    total_inputs:number
    layer_diffs:number[][]
    highest_layer:number
    vector:Tensor
    name:string
}

export type ScanProgressCallback = (progress:ScanProgress) => void

export type LoadModelOptions = {
    backend?:"hf" | "transformerlens"
    device?:string
    dtype?:string
    layerPath?:string
    normPath?:string
    lmHeadPath?:string
}

export type LoadModelResult =
    | { ok:true }
    | { ok:false, error:"unknown_architecture", modelType:string, discovered:string[] }
    | { ok:false, error:string }

export class Client {
    public static model:Model = new Model()

    public static async loadModel(modelName:string, opts:LoadModelOptions = {}):Promise<LoadModelResult> {
        const res = await fetch("http://localhost:8000/load_model", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                model_name: modelName,
                backend: opts.backend ?? "hf",
                device: opts.device ?? "cuda",
                dtype: opts.dtype ?? "float16",
                layer_path: opts.layerPath ?? "",
                norm_path: opts.normPath ?? "",
                lm_head_path: opts.lmHeadPath ?? "",
            })
        })
        const data = await res.json()
        if (data.error === "unknown_architecture") {
            return { ok: false, error: "unknown_architecture", modelType: data.model_type, discovered: data.discovered }
        }
        if (data.error) {
            return { ok: false, error: data.error }
        }
        Client.model.name = modelName
        Client.model.loaded = true
        return { ok: true }
    }

    public static async getModelInfo() {
        const result = await fetch("http://localhost:8000/model_info")
        const data = await result.json()
        Client.model.loaded = data.loaded
        if (!Client.model.loaded) return
        Client.model.name = data.model_name
        Client.model.numLayers = data.num_layers
        Client.model.neuronsPerLayer = data.neurons_per_layer
    }

    public static async scan(
        name:string,
        posInputs:string[],
        negInputs:string[],
        bias:number = 0.0,
        onProgress?:ScanProgressCallback,
        pollInterval:number = 200
    ):Promise<ScanResult> {
        if (!Client.model.loaded) throw new Error("Model not loaded")

        await fetch("http://localhost:8000/scan", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name, pos_inputs: posInputs, neg_inputs: negInputs, bias })
        })

        while (true) {
            await new Promise(r => setTimeout(r, pollInterval))
            const res = await fetch("http://localhost:8000/scan_progress")
            const progress:ScanProgress = await res.json()
            onProgress?.(progress)
            if (progress.done) {
                return {
                    name: progress.name,
                    highest_layer: progress.highest_layer,
                    layer_diffs: progress.layer_diffs,
                    vector: progress.vector
                }
            }
        }
    }

    public static async saveProfile(biases:FeatureBias[]):Promise<void> {
        const res = await fetch("http://localhost:8000/save_profile", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                biases: biases.map(b => ({
                    vector: b.vector,
                    bias: b.bias,
                    layer: b.layer,
                    name: b.name,
                    condition: b.condition,
                }))
            })
        })
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "profile.npbp"
        a.click()
        URL.revokeObjectURL(url)
    }

    public static async separationQuality(
        vector:Tensor,
        layer:number,
        posInputs:string[],
        negInputs:string[],
        skipTokens:string[] = []
    ):Promise<SeparationQuality> {
        const res = await fetch("http://localhost:8000/separation_quality", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                vector,
                layer,
                pos_inputs: posInputs,
                neg_inputs: negInputs,
                skip_tokens: skipTokens
            })
        })
        return await res.json() as SeparationQuality
    }

    public static async loadProfile(file:File):Promise<FeatureBias[]> {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("http://localhost:8000/load_profile", {
            method: "POST",
            body: formData
        })
        const data = await res.json()
        return data.biases.map((b:any) => {
            const fb = new FeatureBias()
            fb.name = b.name
            fb.bias = b.bias
            fb.layer = b.layer
            fb.condition = b.condition
            fb.vector = b.vector
            return fb
        })
    }

    public static async tokenActivations(
        inputs:string[],
        onTotalTokens?:(total:number) => void,
        pollInterval:number = 200
    ):Promise<TokenActivationResult[][]> {
        const startRes = await fetch("http://localhost:8000/token_activations", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ inputs })
        })
        const startData = await startRes.json()
        onTotalTokens?.(startData.total_tokens ?? 0)

        while (true) {
            await new Promise(r => setTimeout(r, pollInterval))
            const res = await fetch("http://localhost:8000/token_activations_progress")
            const data = await res.json()
            if (data.done) return data.results as TokenActivationResult[][]
        }
    }

    public static async logitLens(
        tokenIndex:number,
        inputText:string,
        topK:number = 3
    ):Promise<{ layers:LayerPrediction[] }> {
        const res = await fetch("http://localhost:8000/logit_lens", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ token_index: tokenIndex, input_text: inputText, top_k: topK })
        })
        return await res.json()
    }

    public static async startInference(
        prompt:string,
        biases:FeatureBias[],
        maxTokens:number | null = null
    ):Promise<void> {
        await fetch("http://localhost:8000/inference", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                prompt,
                biases: biases.map(b => ({
                    vector: b.vector,
                    bias: b.bias,
                    layer: b.layer,
                    name: b.name,
                    condition: b.condition,
                })),
                max_tokens: maxTokens
            })
        })
    }

    public static async cancelInference():Promise<void> {
        await fetch("http://localhost:8000/inference_cancel", { method: "POST" })
    }

    public static async getInferenceProgress():Promise<{
        running:boolean
        done:boolean
        cancelled:boolean
        tokens:string[]
        logit_lens:LayerPrediction[][]
        prompt_length:number
    }> {
        const res = await fetch("http://localhost:8000/inference_progress")
        return await res.json()
    }
}