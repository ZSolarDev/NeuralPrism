import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import { useState } from "react"
import { Client, LoadModelOptions } from "../api/client"
import { Input } from "@/components/ui/input"

type Phase = "input" | "unknown_arch"

function ModelLoaderWindow({ onClose, onModelLoad }: {
    onClose:() => void
    onModelLoad?:() => void
}) {
    const [modelName, setModelName] = useState("")
    const [loading, setLoading] = useState(false)
    const [phase, setPhase] = useState<Phase>("input")
    const [loadError, setLoadError] = useState<string | null>(null)
    const [backend, setBackend] = useState<"hf" | "transformerlens">("hf")
    const [discovered, setDiscovered] = useState<string[]>([])
    const [layerPath, setLayerPath] = useState("")
    const [normPath, setNormPath] = useState("")
    const [lmHeadPath, setLmHeadPath] = useState("")

    const tryLoad = async (opts:LoadModelOptions = {}) => {
        setLoading(true)
        setLoadError(null)
        const result = await Client.loadModel(modelName, { backend, ...opts })
        setLoading(false)
        if (result.ok) {
            await Client.getModelInfo()
            onModelLoad?.()
            return
        }
        if (result.error === "unknown_architecture" && "discovered" in result) {
            setDiscovered(result.discovered)
            setPhase("unknown_arch")
            return
        }
        setLoadError(result.error)
    }

    const startLoad = () => tryLoad()

    const retryWithPaths = () => tryLoad({ layerPath, normPath, lmHeadPath })

    const canRetry = layerPath.trim() !== "" && normPath.trim() !== "" && lmHeadPath.trim() !== ""

    if (phase === "unknown_arch") {
        return (
            <NPWindow
                name="Load Model"
                onClose={onClose}
                defaultSize={{ width: 360, height: 260 }}
                fitToBounds={true}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <span style={{ color: "#F44336", fontSize: "0.8rem" }}>
                        Unknown architecture. Provide module paths manually:
                    </span>
                    {discovered.length > 0 && (
                        <span style={{ color: "#555", fontSize: "0.72rem", fontFamily: "monospace" }}>
                            Found: {discovered.join(", ")}
                        </span>
                    )}
                    {[
                        ["Layers path", layerPath, setLayerPath, "e.g. model.layers"],
                        ["Norm path", normPath, setNormPath, "e.g. model.norm"],
                        ["LM head path", lmHeadPath, setLmHeadPath, "e.g. lm_head"],
                    ].map(([label, val, setter, placeholder]) => (
                        <div key={label as string} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            <span style={{ color: "#7C7C7C", fontSize: "0.72rem" }}>{label as string}</span>
                            <Input
                                value={val as string}
                                onChange={e => (setter as (v:string) => void)(e.target.value)}
                                placeholder={placeholder as string}
                                style={{ border: "1px solid #7C7C7C", padding: "4px 8px", fontSize: "0.82rem", backgroundColor: "#252525", height: "28px" }}
                                className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                            />
                        </div>
                    ))}
                    <div style={{ display: "flex", gap: "8px" }}>
                        <NPButton onClick={retryWithPaths} disabled={loading || !canRetry} style={{ flex: 1 }}>
                            {loading ? "Loading..." : "Retry"}
                        </NPButton>
                        <NPButton onClick={() => setPhase("input")} style={{ flex: 1 }}>Back</NPButton>
                    </div>
                </div>
            </NPWindow>
        )
    }

    return (
        <NPWindow
            name="Load Model"
            onClose={onClose}
            defaultSize={{ width: 300, height: 160 }}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Input
                    placeholder="Model name or path..."
                    value={modelName}
                    onChange={e => setModelName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && modelName) startLoad() }}
                    style={{ border: "1px solid #7C7C7C", padding: "4px 8px", fontSize: "0.85rem", backgroundColor: "#252525", height: "31px" }}
                    className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                />
                <div style={{ display: "flex", gap: "6px" }}>
                    {(["hf", "transformerlens"] as const).map(b => (
                        <div
                            key={b}
                            onClick={() => setBackend(b)}
                            style={{
                                flex: 1,
                                textAlign: "center",
                                padding: "3px 0",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                border: `1px solid ${backend === b ? "#7C7C7C" : "#333"}`,
                                color: backend === b ? "#DDD" : "#555",
                                background: backend === b ? "#252525" : "transparent",
                                userSelect: "none",
                            }}
                        >
                            {b === "hf" ? "HuggingFace" : "TransformerLens"}
                        </div>
                    ))}
                </div>
                <NPButton onClick={startLoad} disabled={loading || modelName === ""}>
                    {loading ? "Loading..." : "Load Model"}
                </NPButton>
                {loadError && (
                    <span style={{ color: "#F44336", fontSize: "0.75rem", wordBreak: "break-word", userSelect: "text", cursor: "text" }}>{loadError}</span>
                )}
            </div>
        </NPWindow>
    )
}

export default ModelLoaderWindow