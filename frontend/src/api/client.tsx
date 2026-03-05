export class Model {
    public loaded:boolean = false
    public name:string = ""
    public numLayers:number = 0
    public neuronsPerLayer:number[] = []
}

export enum Task {
    LoadingModel = "Loading Model",
    LoadingModelInfo = "Loading Model Info"
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

    public static async scan(name:string, posInputs:string[], negInputs:string[], bias:number = 0.0):Promise<ScanResult> {
        if (Client.model.loaded === false)
            throw new Error("Model not loaded")
        const res = await fetch("http://localhost:8000/scan", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                name,
                pos_inputs: posInputs,
                neg_inputs: negInputs,
                bias
            })
        })
        const data = await res.json()
        return {
            name: data.name,
            highest_layer: data.highest_layer,
            layer_diffs: data.layer_diffs,
            vector: data.vector
        }
    }
}