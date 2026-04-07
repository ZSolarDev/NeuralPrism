import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import { useState } from "react"
import NPEditableList from "./elements/NPEditableList"
import { Client, FeatureBias, ScanResult, ScanProgress } from "../api/client"
import { Input } from "@/components/ui/input"

function DifferentialScanWindow({ onClose, onScanUpdate, biases, onBiasesChange }: {
    onClose:() => void
    onScanUpdate:(res:ScanResult) => void
    biases:FeatureBias[]
    onBiasesChange:(biases:FeatureBias[]) => void
}) {
    const [name, setName] = useState("")
    const [positive, setPositive] = useState([
    "The king sent off the peasant",
    "The knight rode his steed into battle",
    "The lord granted the serf his freedom",
    "The castle gates opened for the royal procession",
    "The duke bowed before the throne",
    "The herald announced the queen's decree",
])
const [negative, setNegative] = useState([
    "The manager sent the employee home",
    "The driver pulled into the parking lot",
    "The teacher handed out the assignment",
    "The customer asked for a refund",
    "The janitor mopped the office floor",
    "The receptionist answered the phone",
])
    const [scanning, setScanning] = useState(false)
    const [progress, setProgress] = useState<{ current:number, total:number } | null>(null)
    const [skipTokens, setSkipTokens] = useState<string[]>([])

    const startScan = async () => {
        if (scanning) return
        setScanning(true)
        setProgress({ current: 0, total: Client.model.numLayers })

        let lastResult:ScanResult | null = null

        await Client.scan(
            name,
            positive,
            negative,
            1.0,
            (p:ScanProgress) => {
                lastResult = {
                    name: p.name,
                    highest_layer: p.highest_layer,
                    layer_diffs: p.layer_diffs,
                    vector: p.vector,
                }
                onScanUpdate(lastResult)
                setProgress({ current: p.current_input, total: p.total_inputs })
            },
            200,
            skipTokens
        )

        if (lastResult !== null) {
            const r = lastResult as ScanResult
            const existing = biases.findIndex(b => b.name === r.name)
            const updated = new FeatureBias()
            updated.name = r.name
            updated.vector = r.vector
            updated.layer = r.highest_layer
            updated.bias = 0.0
            updated.layer_diffs = r.layer_diffs

            if (existing !== -1) {
                const next = [...biases]
                next[existing] = updated
                onBiasesChange(next)
            } else {
                onBiasesChange([...biases, updated])
            }
        }

        setScanning(false)
        setProgress(null)
    }

    return (
        <NPWindow
            name="Scan"
            onClose={onClose}
            defaultSize={{ width: 300, height: 540 }}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Scan name"
                    style={{
                        border: "1px solid #7C7C7C",
                        padding: "4px 8px",
                        fontSize: "0.85rem",
                        backgroundColor: "#252525",
                        height: "31px"
                    }}
                    className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                />
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
                <NPEditableList
                    label="Skip tokens"
                    items={skipTokens}
                    onChange={setSkipTokens}
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
                <NPButton onClick={startScan} disabled={scanning || !name.trim()}>
                    {scanning ? `Scanning... input ${progress?.current ?? 0}/${progress?.total ?? "?"}` : "Start scanning"}
                </NPButton>
                
            </div>
        </NPWindow>
    )
}

export default DifferentialScanWindow