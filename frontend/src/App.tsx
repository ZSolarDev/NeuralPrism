import NetworkVisualizer from "./netvis/components/NetworkVisualizer"
import { Client, ScanResult } from "./api/client";
import { useState, useEffect } from 'react'
import ScanWindow from "./ui/ScanWindow";
import NPTopBar from "./ui/elements/NPTopBar";
import NPButton from "./ui/elements/NPButton";

const EMPTY_SCAN: ScanResult = {
    name: "",
    highest_layer: 0,
    layer_diffs: [],
    vector: []
}

export async function InitApp(setStatus: (s: string) => void) {
    setStatus("Loading model info...")
    await Client.getModelInfo()
    if (!Client.model.loaded) {
        setStatus("Loading model...")
        await Client.loadModel("phi-2")
        await Client.getModelInfo()
    }
    setStatus("")
}

function App() {
    const [numLayers, setNumLayers] = useState(0)
    const [nPerLayer, setNPerLayer] = useState([0])
    const [scanWindowOpen, setScanWindowOpen] = useState(false)
    const [status, setStatus] = useState("Loading...")
    const [scanRes, setScanRes] = useState<ScanResult>(EMPTY_SCAN)

    useEffect(() => {
        InitApp(setStatus).then(() => {
            setNumLayers(Client.model.numLayers)
            setNPerLayer(Client.model.neuronsPerLayer)
        })
    }, [])

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <NetworkVisualizer
                numLayers={numLayers}
                nPerLayer={nPerLayer}
                nActivations={scanRes.layer_diffs}
                highestLayer={scanRes.highest_layer}
            />
            <NPTopBar>
                <NPButton onClick={() => setScanWindowOpen(true)}>Scan</NPButton>
            </NPTopBar>
            {scanWindowOpen && (
                <ScanWindow
                    onClose={() => setScanWindowOpen(false)}
                    onScanUpdate={setScanRes}
                />
            )}
            {status && (
                <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "#00ff41",
                    fontFamily: "monospace",
                    fontSize: "1.5rem",
                    pointerEvents: "none"
                }}>
                    {status}
                </div>
            )}
        </div>
    )
}

export default App