import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import { useState } from "react"
import NPEditableList from "./elements/NPEditableList"
import { Client, ScanResult, ScanProgress } from "../api/client"

function ScanWindow({ onClose, onScanUpdate }: {
    onClose: () => void
    onScanUpdate: (res: ScanResult) => void
}) {
    const [positive, setPositive] = useState([
        "The king sat on his throne",
        "The queen wore her crown",
        "The prince rode his horse"
    ])
    const [negative, setNegative] = useState([
        "The programmer wrote some code",
        "The dog ran across the field",
        "The chef cooked a meal",
    ])
    const [scanning, setScanning] = useState(false)
    const [progress, setProgress] = useState<{ current: number, total: number } | null>(null)

    const startScan = async () => {
        if (scanning) return
        setScanning(true)
        setProgress({ current: 0, total: Client.model.numLayers })

        const { result } = Client.scanWithHandle(
            "Scan",
            positive,
            negative,
            1.0,
            (p: ScanProgress) => {
                onScanUpdate({
                    name: p.name,
                    highest_layer: p.highest_layer,
                    layer_diffs: p.layer_diffs,
                    vector: p.vector,
                })
                setProgress({ current: p.current_input, total: p.total_inputs })
            }
        )

        await result
        setScanning(false)
        setProgress(null)
    }

    return (
        <NPWindow
            name="Scan"
            onClose={onClose}
            defaultSize={{ width: 300, height: 495.8 }}
            bounds={() => ({ x: 0, y: 35, w: window.innerWidth, h: window.innerHeight - 35 })}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <NPEditableList label="Positive inputs" items={positive} onChange={setPositive} />
                <NPEditableList label="Negative inputs" items={negative} onChange={setNegative} />

                <NPButton onClick={startScan} disabled={scanning}>
                    {scanning ? `Scanning... input ${progress?.current ?? 0}/${progress?.total ?? "?"}` : "Start scanning"}
                </NPButton>
            </div>
        </NPWindow>
    )
}

export default ScanWindow