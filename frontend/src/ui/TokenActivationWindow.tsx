import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import NPConfirmDialog from "./elements/NPConfirmDialog"
import LogitLensWindow from "./LogitLensWindow"
import { Client, FeatureBias, TokenActivationResult } from "../api/client"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { createPortal } from "react-dom"

function cosineSim(a:number[], b:number[]):number {
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

function simColor(sim:number):string {
    const t = Math.max(-1, Math.min(1, sim))
    if (t < 0) return `rgba(244, 67, 54, ${0.15 + -t * 0.5})`
    return `rgba(76, 175, 80, ${0.15 + t * 0.5})`
}

function findHighestLayer(tokenData:number[][]):number {
    let best = 0, bestNorm = 0
    for (let i = 0; i < tokenData.length; i++) {
        const norm = tokenData[i].reduce((s, v) => s + v * v, 0)
        if (norm > bestNorm) { bestNorm = norm; best = i }
    }
    return best
}

function averageVecs(vecs:number[][]):number[] {
    if (vecs.length === 0) return []
    const result = new Array(vecs[0].length).fill(0)
    for (const v of vecs) for (let i = 0; i < v.length; i++) result[i] += v[i]
    return result.map(x => x / vecs.length)
}

function subtractVecs(base:number[], sub:number[]):number[] {
    return base.map((v, i) => v - sub[i])
}

type SelectionMode = "add" | "subtract"
type TokenSelection = { index:number, mode:SelectionMode }
type PendingBias = { tokenData:number[][], name:string }
type LayerPrediction = { layer:number, top:{ token:string, prob:number }[] }

function computeComboActivations(
    results:TokenActivationResult[],
    selection:TokenSelection[]
):number[][] | null {
    if (selection.length === 0) return null
    const addSel = selection.filter(s => s.mode === "add")
    const subSel = selection.filter(s => s.mode === "subtract")
    const numLayers = results[0].data.length
    const combo:number[][] = []
    for (let l = 0; l < numLayers; l++) {
        const addVecs = addSel.map(s => results[s.index].data[l])
        const subVecs = subSel.map(s => results[s.index].data[l])
        let vec = addVecs.length > 0 ? averageVecs(addVecs) : new Array(results[0].data[0].length).fill(0)
        if (subVecs.length > 0) vec = subtractVecs(vec, averageVecs(subVecs))
        combo.push(vec)
    }
    return combo
}

function NameDialog({ defaultName, onConfirm, onCancel }: {
    defaultName:string
    onConfirm:(name:string) => void
    onCancel:() => void
}) {
    const [name, setName] = useState(defaultName)
    return (
        <NPWindow
            name="Name Bias"
            onClose={onCancel}
            defaultSize={{ width: 300, height: 130 }}
            bounds={() => ({ x: 0, y: 35, w: window.innerWidth, h: window.innerHeight - 35 })}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()) }}
                    autoFocus
                    placeholder="Bias name..."
                    style={{
                        border: "1px solid #7C7C7C",
                        padding: "4px 8px",
                        fontSize: "0.85rem",
                        backgroundColor: "#252525",
                        height: "31px"
                    }}
                    className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                />
                <div style={{ display: "flex", gap: "8px" }}>
                    <NPButton onClick={() => { if (name.trim()) onConfirm(name.trim()) }} style={{ flex: 1 }} disabled={!name.trim()}>Add</NPButton>
                    <NPButton onClick={onCancel} style={{ flex: 1 }}>Cancel</NPButton>
                </div>
            </div>
        </NPWindow>
    )
}

function TokenActivationWindow({ onClose, biases, onBiasesChange, onActivationsUpdate }: {
    onClose:() => void
    biases:FeatureBias[]
    onBiasesChange:(biases:FeatureBias[]) => void
    onActivationsUpdate:(activations:number[][], highestLayer:number) => void
}) {
    const [input, setInput] = useState("")
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState<{current:number, total:number} | null>(null)
    const [results, setResults] = useState<TokenActivationResult[] | null>(null)
    const [selection, setSelection] = useState<TokenSelection[]>([])
    const [hoveredToken, setHoveredToken] = useState<number | null>(null)
    const [pending, setPending] = useState<PendingBias | null>(null)
    const [confirmReplace, setConfirmReplace] = useState<{ name:string, tokenData:number[][] } | null>(null)
    const [logitLens, setLogitLens] = useState<{ token:string, layers:LayerPrediction[] } | null>(null)
    const [loadingLens, setLoadingLens] = useState(false)

    const run = async () => {
        if (running || !input.trim()) return
        setRunning(true)
        setResults(null)
        setSelection([])
        setLogitLens(null)
        setProgress({ current: 0, total: 1 })
        try {
            const res = await Client.tokenActivations(
                [input.trim()],
                (current, total) => setProgress({ current, total })
            )
            setResults(res[0])
        } finally {
            setRunning(false)
            setProgress(null)
        }
    }

    const handleTokenClick = (e:React.MouseEvent, i:number, tokenData:number[][]) => {
        const isShift = e.shiftKey
        const isCtrl = e.ctrlKey || e.metaKey
        const mode:SelectionMode = isCtrl ? "subtract" : "add"
        let next:TokenSelection[]
        if (isShift || isCtrl) {
            const existing = selection.findIndex(s => s.index === i)
            if (existing !== -1) {
                next = selection.filter(s => s.index !== i)
            } else {
                next = [...selection, { index: i, mode }]
            }
        } else {
            const existing = selection.findIndex(s => s.index === i)
            if (existing !== -1 && selection.length === 1) {
                next = []
            } else {
                next = [{ index: i, mode: "add" }]
            }
        }
        setSelection(next)
        if (next.length === 0 || !results) return
        const combo = computeComboActivations(results, next)
        if (!combo) return
        const highestLayer = findHighestLayer(combo)
        onActivationsUpdate(combo, highestLayer)
    }

    const openLogitLens = async () => {
        if (!results || selection.length !== 1 || selection[0].mode !== "add") return
        const tokenIndex = selection[0].index
        const tokenStr = results[tokenIndex].token
        setLoadingLens(true)
        try {
            const data = await Client.logitLens(tokenIndex, input.trim())
            setLogitLens({ token: tokenStr, layers: data.layers })
        } finally {
            setLoadingLens(false)
        }
    }

    const activeData = results ? computeComboActivations(results, selection) : null

    const startAddAsBias = (tokenData:number[][], defaultName:string) => {
        setPending({ tokenData, name: defaultName })
    }

    const confirmName = (name:string, tokenData:number[][]) => {
        setPending(null)
        const existing = biases.findIndex(b => b.name === name)
        if (existing !== -1) {
            setConfirmReplace({ name, tokenData })
        } else {
            commitBias(name, tokenData)
        }
    }

    const commitBias = (name:string, tokenData:number[][]) => {
        setConfirmReplace(null)
        const highestLayer = findHighestLayer(tokenData)
        const vector = tokenData[highestLayer]
        const fb = new FeatureBias()
        fb.name = name
        fb.vector = vector
        fb.layer = highestLayer
        fb.bias = 1.0
        const existing = biases.findIndex(b => b.name === name)
        if (existing !== -1) {
            const next = [...biases]
            next[existing] = fb
            onBiasesChange(next)
        } else {
            onBiasesChange([...biases, fb])
        }
    }

    const addCount = selection.filter(s => s.mode === "add").length
    const subCount = selection.filter(s => s.mode === "subtract").length
    const selectionLabel = selection.length === 0 ? null
        : selection.length === 1 ? (results ? results[selection[0].index].token.trim() : "token")
        : `${addCount} add${subCount > 0 ? `, ${subCount} sub` : ""}`

    const canLogitLens = selection.length === 1 && selection[0].mode === "add"

    return (
        <NPWindow
            name="Token Activations"
            onClose={onClose}
            defaultSize={{ width: 420, height: 560 }}
            bounds={() => ({ x: 0, y: 35, w: window.innerWidth, h: window.innerHeight - 35 })}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                    <Input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") run() }}
                        placeholder="Enter text..."
                        style={{
                            border: "1px solid #7C7C7C",
                            padding: "4px 8px",
                            fontSize: "0.85rem",
                            backgroundColor: "#252525",
                            height: "31px",
                            flex: 1
                        }}
                        className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                    />
                    <NPButton onClick={run} disabled={running || !input.trim()}>
                        {running ? `${progress?.current ?? 0}/${progress?.total ?? "?"}` : "Run"}
                    </NPButton>
                </div>

                {results && (
                    <>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px",
                                padding: "8px",
                                background: "#1a1a1a",
                                borderRadius: "6px",
                                border: "1px solid #2C2C2C",
                                cursor: "default"
                            }}
                            onClick={e => { if (e.target === e.currentTarget) setSelection([]) }}
                        >
                            {results.map((t, i) => {
                                const sel = selection.find(s => s.index === i)
                                const isAdd = sel?.mode === "add"
                                const isSub = sel?.mode === "subtract"
                                const isHovered = hoveredToken === i
                                return (
                                    <span
                                        key={i}
                                        onClick={e => handleTokenClick(e, i, t.data)}
                                        onMouseEnter={() => setHoveredToken(i)}
                                        onMouseLeave={() => setHoveredToken(null)}
                                        style={{
                                            padding: "2px 5px",
                                            borderRadius: "3px",
                                            fontSize: "0.85rem",
                                            fontFamily: "monospace",
                                            cursor: "pointer",
                                            background: isAdd
                                                ? "rgba(76, 175, 80, 0.3)"
                                                : isSub
                                                    ? "rgba(244, 67, 54, 0.3)"
                                                    : isHovered
                                                        ? "rgba(255,255,255,0.1)"
                                                        : "rgba(255,255,255,0.04)",
                                            border: isAdd
                                                ? "1px solid rgba(76,175,80,0.6)"
                                                : isSub
                                                    ? "1px solid rgba(244,67,54,0.6)"
                                                    : "1px solid transparent",
                                            color: isAdd ? "#4CAF50" : isSub ? "#F44336" : "#DDD",
                                            transition: "background 0.1s ease, color 0.1s ease, border 0.1s ease",
                                            userSelect: "none"
                                        }}
                                    >
                                        {t.token}
                                    </span>
                                )
                            })}
                        </div>
                        <span style={{ color: "#555", fontSize: "0.7rem" }}>
                            click · shift+click add · ctrl+click subtract
                        </span>
                    </>
                )}

                {activeData && selection.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                            <span style={{ color: "#A7A7A7", fontSize: "0.8rem", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                Vector: <span style={{ color: "#4CAF50", fontFamily: "monospace" }}>{selectionLabel}</span>
                            </span>
                            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                                {canLogitLens && (
                                    <NPButton
                                        onClick={openLogitLens}
                                        disabled={loadingLens}
                                        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                                    >
                                        {loadingLens ? "Loading..." : "Logit Lens"}
                                    </NPButton>
                                )}
                                <NPButton
                                    onClick={() => startAddAsBias(activeData, selectionLabel ?? "Token")}
                                    style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                                >
                                    + Add as Bias
                                </NPButton>
                            </div>
                        </div>

                        {biases.length > 0 && (
                            <div style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                padding: "8px",
                                background: "#1a1a1a",
                                borderRadius: "6px",
                                border: "1px solid #2C2C2C"
                            }}>
                                <span style={{ color: "#7C7C7C", fontSize: "0.75rem", marginBottom: "2px" }}>Bias similarities</span>
                                {biases.map((b, i) => {
                                    const vec = activeData[b.layer] ?? activeData[0]
                                    const sim = cosineSim(vec, b.vector as number[])
                                    const pct = Math.round(Math.max(0, Math.min(1, (sim + 0.5) / 1.0)) * 100)
                                    return (
                                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <span style={{ color: "#A7A7A7", fontSize: "0.75rem", width: "100px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {b.name}
                                            </span>
                                            <div style={{ flex: 1, height: "6px", background: "#252525", borderRadius: "3px", overflow: "hidden" }}>
                                                <div style={{
                                                    height: "100%",
                                                    width: `${pct}%`,
                                                    background: simColor(sim),
                                                    borderRadius: "3px",
                                                    transition: "width 0.3s ease"
                                                }} />
                                            </div>
                                            <span style={{
                                                color: sim > 0 ? "#4CAF50" : "#F44336",
                                                fontSize: "0.7rem",
                                                fontFamily: "monospace",
                                                width: "52px",
                                                textAlign: "right",
                                                flexShrink: 0
                                            }}>
                                                {sim.toFixed(4)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {pending && createPortal(
                <NameDialog
                    defaultName={pending.name}
                    onConfirm={name => confirmName(name, pending.tokenData)}
                    onCancel={() => setPending(null)}
                />,
                document.body
            )}

            {confirmReplace && createPortal(
                <NPConfirmDialog
                    message={`A bias named "${confirmReplace.name}" already exists. Replace it?`}
                    onConfirm={() => commitBias(confirmReplace.name, confirmReplace.tokenData)}
                    onCancel={() => setConfirmReplace(null)}
                />,
                document.body
            )}

            {logitLens && createPortal(
                <LogitLensWindow
                    onClose={() => setLogitLens(null)}
                    token={logitLens.token}
                    layers={logitLens.layers}
                />,
                document.body
            )}
        </NPWindow>
    )
}

export default TokenActivationWindow