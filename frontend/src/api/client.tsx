export class Model {
    public loaded:boolean = false
    public name:string = ""
    public numLayers:number = 0
    public neuronsPerLayer:number[] = []
}

export enum Task {
    LoadingModel = "Loading Model",
    LoadingModelInfo = "Loading Model Info",
    Scanning = "Scanning"
}

export type TaskHandle = {
    id:number
    type:Task
    active:boolean
}

export type ScanResult = {
    name:string
    highest_layer:number
    layer_diffs:number[][]
    vector:number[]
}

export type ScanProgress = {
    running: boolean
    done: boolean
    current_input: number
    total_inputs: number
    layer_diffs: number[][]
    highest_layer: number
    vector: number[]
    name: string
}

export type ScanProgressCallback = (progress: ScanProgress) => void

export class Busy {
    public currentTasks:Map<number, Task> = new Map()
    private _isBusy:boolean = false;
    public async isBusy(stall:boolean = false) {
        let getStatus = (async () => {
            const res = await fetch("http://localhost:8000/status")
            const data = await res.json()
            this._isBusy = !data.complete
        });
        if (stall) await getStatus(); else getStatus()
        return this._isBusy
    }

    public hasTask(task:Task):boolean {
        return [...this.currentTasks.values()].some(t => t === task);
    }

    public async waitTilNotBusy() {
        const res = await fetch("http://localhost:8000/status")
        const data = await res.json()
        while (!data.complete) await new Promise(r => setTimeout(r, 500))
    }

    public addTask(task:Task):TaskHandle {
        this.currentTasks.set(this.currentTasks.size + 1, task)
        return {
            id: this.currentTasks.size + 1,
            type: task,
            active: true
        }
    }

    public removeTask(task:TaskHandle) {
        this.currentTasks.delete(task.id)
        task.active = false
    }
}

export class Client {
    public static busy:Busy = new Busy()
    public static model:Model = new Model()

    public static async loadModel(model_name:string) {
        await fetch("http://localhost:8000/load_model", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({model_name: model_name})
        })
        Client.model.name = model_name
        Client.model.loaded = true
    }

    public static loadModelWithHandle(model_name:string):TaskHandle {
        let handle = Client.busy.addTask(Task.LoadingModel);
        (async () => {
            await Client.loadModel(model_name)
            Client.busy.removeTask(handle)
        })()
        return handle
    }

    public static async getModelInfo(){
        const result = await fetch("http://localhost:8000/model_info")
        const data = await result.json()
        Client.model.loaded = data.loaded
        Client.model.numLayers = data.num_layers
        Client.model.neuronsPerLayer = data.neurons_per_layer
    }

    public static getModelInfoWithHandle():TaskHandle {
        let handle = Client.busy.addTask(Task.LoadingModelInfo);
        (async () => {
            await Client.getModelInfo()
            Client.busy.removeTask(handle)
        })()
        return handle
    }

    /**
     * Starts a scan and polls /scan_progress, firing onProgress each tick.
     * Resolves with the final ScanResult when done.
     */
    public static async scan(
        name: string,
        posInputs: string[],
        negInputs: string[],
        bias: number = 0.0,
        onProgress?: ScanProgressCallback,
        pollInterval: number = 200
    ): Promise<ScanResult> {
        if (!Client.model.loaded)
            throw new Error("Model not loaded")

        // kick off the scan (returns immediately with {started: true})
        await fetch("http://localhost:8000/scan", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                name,
                pos_inputs: posInputs,
                neg_inputs: negInputs,
                bias
            })
        })

        // poll until done
        while (true) {
            await new Promise(r => setTimeout(r, pollInterval))

            const res = await fetch("http://localhost:8000/scan_progress")
            const progress: ScanProgress = await res.json()

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

    public static scanWithHandle(
        name: string,
        posInputs: string[],
        negInputs: string[],
        bias: number = 0.0,
        onProgress?: ScanProgressCallback
    ): { handle: TaskHandle; result: Promise<ScanResult> } {
        const handle = Client.busy.addTask(Task.Scanning)
        const result = (async () => {
            try {
                return await Client.scan(name, posInputs, negInputs, bias, onProgress)
            } finally {
                Client.busy.removeTask(handle)
            }
        })()
        return { handle, result }
    }
}