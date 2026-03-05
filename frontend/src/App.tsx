import NetworkVisualizer from "./netvis/components/NetworkVisualizer"
import { Client, ScanResult } from "./api/client";
import { useState, useEffect } from 'react'

let scanRes: ScanResult = {
    name: "Medieval - Scanning...",
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

    const saved = localStorage.getItem('scanResults')
    if (saved) {
        scanRes = JSON.parse(saved)
    } else {
        setStatus("Scanning...")
        scanRes = await Client.scan("Medieval", [
            "The king sat on his throne",
            "The queen wore her crown",
            "The prince rode his horse"
        ],[
            "The programmer wrote some code",
            "The dog ran across the field",
            "The chef cooked a meal",
        ], 1)
        localStorage.setItem('scanResults', JSON.stringify(scanRes))
    }
    setStatus("")
}

function App() {
    const [numLayers, setNumLayers] = useState(0)
    const [nPerLayer, setNPerLayer] = useState([0])
    const [status, setStatus] = useState("Loading...")

    useEffect(() => {
        InitApp(setStatus).then(() => {
            setNumLayers(Client.model.numLayers)
            setNPerLayer(Client.model.neuronsPerLayer)
        })
    }, [])

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <NetworkVisualizer numLayers={numLayers} nPerLayer={nPerLayer} nActivations={scanRes.layer_diffs} highestLayer={scanRes.highest_layer}/>
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