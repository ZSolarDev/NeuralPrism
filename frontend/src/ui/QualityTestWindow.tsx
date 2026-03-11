import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import NPEditableList from "./elements/NPEditableList"
import { Client, FeatureBias, SeparationQuality } from "../api/client"
import { Input } from "@/components/ui/input"
import { useState } from "react"

function qualityColor(q:number):string {
    if (q < 0.55) return `rgb(180, 40, 40)`
    if (q < 0.65) return `rgb(200, ${Math.round((q - 0.55) * 1400)}, 40)`
    if (q < 0.75) return `rgb(200, 160, 40)`
    return `rgb(${Math.round(180 - (q - 0.75) * 400)}, ${180 + Math.round((q - 0.75) * 100)}, 60)`
}

function qualityLabel(q:number):string {
    if (q < 0.5) return "Inverted separation, wrong direction!!"
    if (q < 0.55) return "No separation"
    if (q < 0.65) return "Weak separation"
    if (q < 0.75) return "Moderate separation"
    if (q < 0.88) return "Good separation"
    return "Strong separation"
}

function simColor(isPositive:boolean, spread:number):string {
    const confidence = Math.min(1, Math.max(0, spread / 0.3))
    const neutral = [120, 120, 120]
    const target = isPositive ? [76, 175, 80] : [244, 67, 54]
    const r = Math.round(neutral[0] + (target[0] - neutral[0]) * confidence)
    const g = Math.round(neutral[1] + (target[1] - neutral[1]) * confidence)
    const b = Math.round(neutral[2] + (target[2] - neutral[2]) * confidence)
    return `rgb(${r}, ${g}, ${b})`
}

function QualityBar({ quality }: { quality:number | null }) {
    const color = quality !== null ? qualityColor(quality) : "#333"
    const pct = quality !== null ? Math.round(quality * 100) : 0

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{
                height: "12px",
                borderRadius: "6px",
                background: "#1a1a1a",
                border: "1px solid #2C2C2C",
                overflow: "hidden"
            }}>
                <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: color,
                    borderRadius: "6px",
                    transition: "width 0.5s ease, background 0.5s ease"
                }} />
            </div>
            {quality !== null && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color, fontSize: "0.8rem", transition: "color 0.5s ease" }}>
                        {qualityLabel(quality)}
                    </span>
                    <span style={{ color, fontSize: "0.8rem", fontFamily: "monospace", transition: "color 0.5s ease" }}>
                        {pct}%
                    </span>
                </div>
            )}
        </div>
    )
}

function QualityTestWindow({ onClose, biases }: {
    onClose:() => void
    biases:FeatureBias[]
}) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [positive, setPositive] = useState<string[]>([""])
    const [negative, setNegative] = useState<string[]>([""])
    const [testing, setTesting] = useState(false)
    const [result, setResult] = useState<SeparationQuality | null>(null)

    const test = async () => {
        if (testing || biases.length === 0) return
        const bias = biases[selectedIndex]
        if (!bias) return
        setTesting(true)
        setResult(null)
        try {
            const res = await Client.separationQuality(
                bias.vector,
                bias.layer,
                positive.filter(s => s.trim()),
                negative.filter(s => s.trim()),
            )
            setResult(res)
        } finally {
            setTesting(false)
        }
    }

    if (biases.length === 0) return (
        <NPWindow
            name="Quality Test"
            onClose={onClose}
            defaultSize={{ width: 340, height: 160 }}
        >
            <span style={{ color: "#555", fontSize: "0.85rem" }}>No biases loaded. Scan something first.</span>
        </NPWindow>
    )

    const spread = result ? result.avg_pos - result.avg_neg : 0

    return (
        <NPWindow
            name="Quality Test"
            onClose={onClose}
            defaultSize={{ width: 340, height: 560 }}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ color: "#A7A7A7", fontSize: "0.8rem" }}>Bias to test</span>
                    <select
                        value={selectedIndex}
                        onChange={e => { setSelectedIndex(parseInt(e.target.value)); setResult(null) }}
                        style={{
                            background: "#252525",
                            border: "1px solid #7C7C7C",
                            color: "#DDD",
                            fontSize: "0.85rem",
                            borderRadius: "4px",
                            padding: "4px 8px",
                            height: "31px",
                            cursor: "pointer"
                        }}
                    >
                        {biases.map((b, i) => (
                            <option key={i} value={i}>{b.name || `Bias ${i}`}</option>
                        ))}
                    </select>
                </div>

                <NPEditableList
                    label="Positive inputs"
                    items={positive}
                    onChange={setPositive}
                    onAdd={() => ""}
                    renderItem={(item, _, update) => (
                        <Input
                            value={item}
                            onChange={e => update(e.target.value)}
                            style={{
                                border: "1px solid #7C7C7C",
                                padding: "4px 8px",
                                fontSize: "0.85rem",
                                backgroundColor: "#252525",
                                height: "31px"
                            }}
                            className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                        />
                    )}
                />
                <NPEditableList
                    label="Negative inputs"
                    items={negative}
                    onChange={setNegative}
                    onAdd={() => ""}
                    renderItem={(item, _, update) => (
                        <Input
                            value={item}
                            onChange={e => update(e.target.value)}
                            style={{
                                border: "1px solid #7C7C7C",
                                padding: "4px 8px",
                                fontSize: "0.85rem",
                                backgroundColor: "#252525",
                                height: "31px"
                            }}
                            className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                        />
                    )}
                />

                <QualityBar quality={result?.quality ?? null} />

                <NPButton
                    onClick={test}
                    disabled={testing || positive.every(s => !s.trim()) || negative.every(s => !s.trim())}
                >
                    {testing ? "Testing..." : "Test Quality"}
                </NPButton>

                {result && (
                    <div style={{ display: "flex", gap: "8px" }}>
                        <div style={{
                            flex: 1,
                            background: "#1a1a1a",
                            border: "1px solid #2C2C2C",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px"
                        }}>
                            <span style={{ color: "#7C7C7C", fontSize: "0.7rem" }}>avg positive</span>
                            <span style={{ color: simColor(true, spread), fontSize: "0.8rem", fontFamily: "monospace", transition: "color 0.5s ease" }}>
                                {result.avg_pos.toFixed(4)}
                            </span>
                        </div>
                        <div style={{
                            flex: 1,
                            background: "#1a1a1a",
                            border: "1px solid #2C2C2C",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px"
                        }}>
                            <span style={{ color: "#7C7C7C", fontSize: "0.7rem" }}>avg negative</span>
                            <span style={{ color: simColor(false, spread), fontSize: "0.8rem", fontFamily: "monospace", transition: "color 0.5s ease" }}>
                                {result.avg_neg.toFixed(4)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </NPWindow>
    )
}

export default QualityTestWindow