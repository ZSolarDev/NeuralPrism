import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import { useState } from "react"
import { Client } from "../api/client"
import { Input } from "@/components/ui/input"

function ModelLoaderWindow({ onClose, onModelLoad, onError }: {
    onClose:() => void
    onModelLoad?:() => void
    onError?:() => void
}) {
    const [modelName, setModelName] = useState("")
    const [loading, setLoading] = useState(false)

    const startLoad = async () => {
        if (loading) return
        setLoading(true)
        await Client.loadModel(modelName)
        if (!Client.model.loaded){
            setLoading(false)
            onError?.()
            return
        }
        await Client.getModelInfo()
        setLoading(false)
        onModelLoad?.()
    }

    return (
        <NPWindow
            name="Load Model"
            onClose={onClose}
            defaultSize={{ width: 300, height: 140 }}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Input 
                    placeholder="Transformer Lens model goes here.."
                    onChange={e => setModelName(e.target.value)} 
                    style={{ 
                        border: "1px solid #7C7C7C",
                        padding: "4px 8px 4px 8px",
                        fontSize: "0.85rem",
                        backgroundColor: "#252525",
                        height: "31px"
                    }}
                    className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                />

                <NPButton onClick={startLoad} disabled={loading || modelName === ""}>
                    {loading ? "Loading..." : "Load Model"}
                </NPButton>
            </div>
        </NPWindow>
    )
}

export default ModelLoaderWindow