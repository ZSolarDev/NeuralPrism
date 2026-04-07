import { FeatureBias } from "./api/client"

class Project {
    public name:string = ""
    public description:string = ""
    public model:string = ""
    public biases:FeatureBias[] = []
}

export default Project