import NetworkVisualizer from "./netvis/components/NetworkVisualizer"
import { Client, FeatureBias, ScanResult } from "./api/client";
import { useState, useEffect } from 'react'
import DifferentialScanWindow from "./ui/DifferentialScanWindow";
import NPTopBar from "./ui/elements/NPTopBar";
import NPButton from "./ui/elements/NPButton";
import ModelLoaderWindow from "./ui/ModelLoaderWindow";
import BiasManagerWindow from "./ui/BiasManagerWindow";
import QualityTestWindow from "./ui/QualityTestWindow";
import Project from "./Project";

const EMPTY_SCAN: ScanResult = {
    name: "",
    highest_layer: 0,
    layer_diffs: [],
    vector: []
}

let project:Project = new Project()

export async function InitApp(setStatus: (s: string) => void) {
    project.name = "New Project"
    project.description = "Description goes here."
    await Client.getModelInfo()
}

function App() {
    const [numLayers, setNumLayers] = useState(0)
    const [nPerLayer, setNPerLayer] = useState([0])
    const [differentialScanWindowOpen, setDifferentialScanWindowOpen] = useState(false)
    const [modelLoaderWindowOpen, setModelLoaderWindowOpen] = useState(false)
    const [biasManagerWindowOpen, setBiasManagerWindowOpen] = useState(false)
    const [qualityTestWindowOpen, setQualityTestWindowOpen] = useState(false)
    const [status, setStatus] = useState("")
    const [scanRes, setScanRes] = useState<ScanResult>(EMPTY_SCAN)
    const [modelName, setModelName] = useState("")
    const [scaledActivations, setScaledActivations] = useState(true)
    const [biases, setProjectBiases] = useState(project.biases)

    const setBiases = (pBiases:FeatureBias[]) => {
        setProjectBiases(pBiases)
        project.biases = pBiases
    }

    const updateModelInfo = () => {
        setNumLayers(Client.model.numLayers)
        setNPerLayer(Client.model.neuronsPerLayer)
        setModelName(Client.model.name)
        project.model = Client.model.name
    }

    useEffect(() => {
        InitApp(setStatus).then(updateModelInfo)
    }, [])

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <NetworkVisualizer
                numLayers={numLayers}
                nPerLayer={nPerLayer}
                nActivations={scanRes.layer_diffs}
                highestLayer={scanRes.highest_layer}
                rawMode={!scaledActivations}
            />
            <NPTopBar>
                <p>Current model loaded: {modelName}</p>
                <NPButton onClick={() => setModelLoaderWindowOpen(true)}>Load Model</NPButton>
                <NPButton
                    onClick={() => setDifferentialScanWindowOpen(true)}
                    disabled={!Client.model.loaded}
                >
                    Differential Scan
                </NPButton>
                <NPButton onClick={() => setScaledActivations(!scaledActivations)}>Scaled Activations [{scaledActivations ? "ON" : "OFF"}]</NPButton>
                <NPButton onClick={() => setBiasManagerWindowOpen(true)}>Bias Manager</NPButton>
                <NPButton
                    onClick={() => setQualityTestWindowOpen(true)}
                    disabled={!Client.model.loaded}
                >
                    Quality Test
                </NPButton>
            </NPTopBar>
            {modelLoaderWindowOpen && (
                <ModelLoaderWindow
                    onClose={() => setModelLoaderWindowOpen(false)}
                    onModelLoad={updateModelInfo}
                />
            )}
            {differentialScanWindowOpen && (
                <DifferentialScanWindow
                    onClose={() => setDifferentialScanWindowOpen(false)}
                    onScanUpdate={setScanRes}
                    biases={biases}
                    onBiasesChange={setBiases}
                />
            )}
            {biasManagerWindowOpen && (
                <BiasManagerWindow
                    onClose={() => setBiasManagerWindowOpen(false)}
                    biases={biases}
                    onChange={setBiases}
                />
            )}
            {qualityTestWindowOpen && (
                <QualityTestWindow
                    onClose={() => setQualityTestWindowOpen(false)}
                    biases={biases}
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