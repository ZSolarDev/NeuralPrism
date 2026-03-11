import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import LogitLensWindow from "./LogitLensWindow"
import { Client, FeatureBias, LayerPrediction } from "../api/client"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"

type InferenceToken = {
    token:string
    logitLens:LayerPrediction[]
}

function BiasChip({ name }:{ name:string }) {
    const [hovered, setHovered] = useState(false)
    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: "2px 6px",
                borderRadius: "3px",
                fontSize: "0.62rem",
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "90px",
                border: `1px solid ${hovered ? "rgba(96,165,250,0.6)" : "rgba(96,165,250,0.2)"}`,
                background: hovered ? "rgba(96,165,250,0.15)" : "rgba(96,165,250,0.06)",
                color: hovered ? "#60a5fa" : "rgba(96,165,250,0.6)",
                transition: "all 0.15s ease",
                cursor: "default",
                userSelect: "none",
            }}
            title={name}
        >
            {name}
        </div>
    )
}

function InferenceStatusWindow({ onClose, biases, prompt }: {
    onClose:() => void
    biases:FeatureBias[]
    prompt:string
}) {
    const [tokens, setTokens] = useState<InferenceToken[]>([])
    const [running, setRunning] = useState(true)
    const [cancelled, setCancelled] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [selectedToken, setSelectedToken] = useState<InferenceToken | null>(null)
    const [hoveredToken, setHoveredToken] = useState<number | null>(null)
    const [newTokens, setNewTokens] = useState<Set<number>>(new Set())
    const [logitLens, setLogitLens] = useState<{ token: string, layers: LayerPrediction[] } | null>(null)
    const knownCount = useRef(0)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        pollRef.current = setInterval(async () => {
            const data = await Client.getInferenceProgress()
            const incoming = data.tokens as string[]
            const incomingLens = data.logit_lens as LayerPrediction[][]

            if (incoming.length > knownCount.current) {
                const newIdxs = new Set<number>()
                for (let i = knownCount.current; i < incoming.length; i++) newIdxs.add(i)
                knownCount.current = incoming.length
                setTokens(incoming.map((t, i) => ({ token: t, logitLens: incomingLens[i] ?? [] })))
                setNewTokens(newIdxs)
                setTimeout(() => setNewTokens(new Set()), 600)
            }

            if (data.cancelled) setCancelled(true)

            if (data.done) {
                setRunning(false)
                setCancelling(false)
                if (pollRef.current) clearInterval(pollRef.current)
            }
        }, 150)

        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [])

    const cancel = async () => {
        setCancelling(true)
        await Client.cancelInference()
    }

    const statusText = cancelling ? "Cancelling..."
        : cancelled ? `Cancelled: ${tokens.length} tokens`
            : running ? `Generating... ${tokens.length} tokens`
                : `Done: ${tokens.length} tokens`

    const statusColor = cancelling || cancelled ? "#F44336" : running ? "#4CAF50" : "#7C7C7C"

    const biasLayerSublabels:Record<number, React.ReactNode> = {}
    for (const bias of biases) {
        const layer = bias.layer
        const existing = biasLayerSublabels[layer]
        const chip = <BiasChip key={bias.name} name={bias.name} />
        biasLayerSublabels[layer] = (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
                {existing}
                {chip}
            </div>
        )
    }

    return (
        <NPWindow
            name="Inference Status"
            onClose={onClose}
            defaultSize={{ width: 480, height: 460 }}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <style>{`
                    @keyframes np-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                    @keyframes np-flash {
                        0% { background: rgba(76,175,80,0.5); color: #4CAF50; }
                        100% { background: rgba(255,255,255,0.04); color: #DDD; }
                    }
                `}</style>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {running && !cancelling && (
                            <div style={{
                                width: "8px", height: "8px", borderRadius: "50%",
                                background: "#4CAF50", boxShadow: "0 0 6px #4CAF50",
                                animation: "np-pulse 1s ease-in-out infinite", flexShrink: 0
                            }} />
                        )}
                        <span style={{ color: statusColor, fontSize: "0.8rem" }}>{statusText}</span>
                    </div>
                    {running && (
                        <NPButton
                            onClick={cancel}
                            disabled={cancelling}
                            style={{ fontSize: "0.75rem", padding: "2px 10px", borderColor: "#F44336", color: cancelling ? "#555" : "#F44336" }}
                        >
                            {cancelling ? "Cancelling..." : "Cancel"}
                        </NPButton>
                    )}
                </div>

                <div style={{ border: "1px solid #2C2C2C", borderRadius: "6px", overflow: "hidden" }}>
                    <div style={{ padding: "8px", background: "#1a1a1a", borderBottom: "1px solid #2C2C2C" }}>
                        <span style={{ color: "#555", fontSize: "0.72rem", fontFamily: "monospace" }}>prompt</span>
                        <div style={{
                            color: "#A7A7A7", fontSize: "0.82rem", fontFamily: "monospace",
                            marginTop: "4px", whiteSpace: "pre-wrap", wordBreak: "break-word",
                            maxHeight: "80px", overflowY: "auto"
                        }}>
                            {prompt}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "flex", flexWrap: "wrap", gap: "4px",
                            padding: "8px", background: "#141414",
                            minHeight: "48px", maxHeight: "180px", overflowY: "auto"
                        }}
                        onClick={e => { if (e.target === e.currentTarget) setSelectedToken(null) }}
                    >
                        {tokens.length === 0 && running && (
                            <span style={{ color: "#444", fontSize: "0.8rem", alignSelf: "center" }}>Waiting for first token...</span>
                        )}
                        {tokens.map((t, i) => {
                            const isSelected = selectedToken === t
                            const isHovered = hoveredToken === i
                            const isNew = newTokens.has(i)
                            return (
                                <span
                                    key={i}
                                    onClick={() => setSelectedToken(isSelected ? null : t)}
                                    onMouseEnter={() => setHoveredToken(i)}
                                    onMouseLeave={() => setHoveredToken(null)}
                                    style={{
                                        padding: "2px 5px",
                                        borderRadius: "3px",
                                        fontSize: "0.85rem",
                                        fontFamily: "monospace",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        background: isSelected
                                            ? "rgba(76,175,80,0.3)"
                                            : isHovered
                                                ? "rgba(255,255,255,0.1)"
                                                : "rgba(255,255,255,0.04)",
                                        border: isSelected
                                            ? "1px solid rgba(76,175,80,0.6)"
                                            : "1px solid transparent",
                                        color: isSelected ? "#4CAF50" : "#DDD",
                                        animation: isNew ? "np-flash 0.6s ease-out forwards" : undefined,
                                        transition: isNew ? undefined : "background 0.1s ease, color 0.1s ease",
                                        userSelect: "none"
                                    }}
                                >
                                    {t.token}
                                </span>
                            )
                        })}
                    </div>
                </div>

                {selectedToken && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                        <span style={{ color: "#7C7C7C", fontSize: "0.8rem" }}>
                            Token: <span style={{ color: "#4CAF50", fontFamily: "monospace" }}>{selectedToken.token.trim()}</span>
                        </span>
                        <NPButton
                            onClick={() => setLogitLens({ token: selectedToken.token.trim(), layers: selectedToken.logitLens })}
                            disabled={selectedToken.logitLens.length === 0}
                            style={{ fontSize: "0.75rem", padding: "2px 8px", flexShrink: 0 }}
                        >
                            Logit Lens
                        </NPButton>
                    </div>
                )}


            </div>

            {logitLens && createPortal(
                <LogitLensWindow
                    onClose={() => setLogitLens(null)}
                    token={logitLens.token}
                    layers={logitLens.layers}
                    layerSublabels={biases.length > 0 ? biasLayerSublabels : undefined}
                />,
                document.body
            )}
        </NPWindow>
    )
}

export default InferenceStatusWindow