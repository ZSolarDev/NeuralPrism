import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import { Client, FeatureBias } from "../api/client"
import { Input } from "@/components/ui/input"
import { useState } from "react"

function InferenceWindow({ onClose, biases, onInferenceStart }: {
    onClose:() => void
    biases:FeatureBias[]
    onInferenceStart:(prompt:string) => void
}) {
    const [prompt, setPrompt] = useState("")
    const [maxTokens, setMaxTokens] = useState<number | null>(200)
    const [useMaxTokens, setUseMaxTokens] = useState(true)
    const [activeBiases, setActiveBiases] = useState<Set<number>>(new Set(biases.map((_, i) => i)))
    const [running, setRunning] = useState(false)

    const toggleBias = (i:number) => {
        const next = new Set(activeBiases)
        if (next.has(i)) next.delete(i)
        else next.add(i)
        setActiveBiases(next)
    }

    const run = async () => {
        if (!prompt.trim() || running) return
        setRunning(true)
        const selected = biases.filter((_, i) => activeBiases.has(i))
        await Client.startInference(
            prompt.trim(),
            selected,
            useMaxTokens ? (maxTokens ?? 200) : null
        )
        onInferenceStart(prompt.trim())
        onClose()
    }

    return (
        <NPWindow
            name="Inference"
            onClose={onClose}
            defaultSize={{ width: 360, height: 320 }}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ color: "#A7A7A7", fontSize: "0.8rem" }}>Prompt</span>
                    <textarea
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder="Enter prompt..."
                        rows={4}
                        style={{
                            border: "1px solid #7C7C7C",
                            padding: "6px 8px",
                            fontSize: "0.85rem",
                            backgroundColor: "#252525",
                            color: "#DDD",
                            borderRadius: "4px",
                            resize: "vertical",
                            fontFamily: "inherit",
                            outline: "none",
                        }}
                        onFocus={e => e.target.style.borderColor = "#FFF"}
                        onBlur={e => e.target.style.borderColor = "#7C7C7C"}
                    />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                            onClick={() => setUseMaxTokens(!useMaxTokens)}
                            style={{
                                width: "14px", height: "14px",
                                border: `1px solid ${useMaxTokens ? "#4CAF50" : "#7C7C7C"}`,
                                borderRadius: "3px",
                                background: useMaxTokens ? "rgba(76,175,80,0.2)" : "transparent",
                                cursor: "pointer",
                                flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                        >
                            {useMaxTokens && <span style={{ color: "#4CAF50", fontSize: "0.65rem", lineHeight: 1 }}>✓</span>}
                        </span>
                        <span style={{ color: "#A7A7A7", fontSize: "0.8rem" }}>Max tokens</span>
                        {useMaxTokens && (
                            <Input
                                type="number"
                                value={maxTokens ?? ""}
                                min={1}
                                max={2048}
                                onChange={e => setMaxTokens(parseInt(e.target.value) || null)}
                                style={{
                                    border: "1px solid #7C7C7C",
                                    padding: "2px 6px",
                                    fontSize: "0.8rem",
                                    backgroundColor: "#252525",
                                    height: "26px",
                                    width: "70px"
                                }}
                                className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                            />
                        )}
                    </div>
                </div>

                {biases.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ color: "#A7A7A7", fontSize: "0.8rem" }}>Active biases</span>
                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            padding: "8px",
                            background: "#1a1a1a",
                            borderRadius: "6px",
                            border: "1px solid #2C2C2C",
                            maxHeight: "180px",
                            overflowY: "auto"
                        }}>
                            {biases.map((b, i) => {
                                const active = activeBiases.has(i)
                                return (
                                    <div
                                        key={i}
                                        onClick={() => toggleBias(i)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            cursor: "pointer",
                                            padding: "3px 4px",
                                            borderRadius: "4px",
                                            background: active ? "rgba(76,175,80,0.08)" : "transparent",
                                            transition: "background 0.1s ease"
                                        }}
                                    >
                                        <span style={{
                                            width: "14px", height: "14px",
                                            border: `1px solid ${active ? "#4CAF50" : "#555"}`,
                                            borderRadius: "3px",
                                            background: active ? "rgba(76,175,80,0.2)" : "transparent",
                                            flexShrink: 0,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            transition: "all 0.1s ease"
                                        }}>
                                            {active && <span style={{ color: "#4CAF50", fontSize: "0.65rem", lineHeight: 1 }}>✓</span>}
                                        </span>
                                        <span style={{ color: active ? "#DDD" : "#666", fontSize: "0.82rem", transition: "color 0.1s ease" }}>
                                            {b.name || `Bias ${i}`}
                                        </span>
                                        <span style={{ color: "#444", fontSize: "0.72rem", marginLeft: "auto", fontFamily: "monospace" }}>
                                            x{b.bias.toFixed(2)}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {biases.length === 0 && (
                    <span style={{ color: "#555", fontSize: "0.8rem" }}>No biases loaded! Inference will run unsteered.</span>
                )}

                <NPButton onClick={run} disabled={running || !prompt.trim()}>
                    {running ? "Starting..." : "Inference"}
                </NPButton>
            </div>
        </NPWindow>
    )
}

export default InferenceWindow