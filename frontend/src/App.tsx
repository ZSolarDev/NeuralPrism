import NetworkVisualizer from "./netvis/components/NetworkVisualizer"
import { Client, FeatureBias, ScanResult } from "./api/client"
import { useState, useEffect, useRef } from 'react'
import DifferentialScanWindow from "./ui/DifferentialScanWindow"
import NPTopBar from "./ui/elements/NPTopBar"
import NPButton from "./ui/elements/NPButton"
import ModelLoaderWindow from "./ui/ModelLoaderWindow"
import BiasManagerWindow from "./ui/BiasManagerWindow"
import QualityTestWindow from "./ui/QualityTestWindow"
import TokenActivationWindow from "./ui/TokenActivationWindow"
import InferenceWindow from "./ui/InferenceWindow"
import InferenceStatusWindow from "./ui/InferenceStatusWindow"
import Project from "./Project"

const EMPTY_SCAN:ScanResult = {
    name: "",
    highest_layer: 0,
    layer_diffs: [],
    vector: []
}

let project:Project = new Project()

export async function InitApp(setStatus:(s:string) => void) {
    project.name = "New Project"
    project.description = "Description goes here."
    await Client.getModelInfo()
}

function App() {
    const [numLayers, setNumLayers] = useState(0)
    const [nPerLayer, setNPerLayer] = useState([0])
    const [nPerLayerOverride, setNPerLayerOverride] = useState<number[] | null>(null)
    const [differentialScanWindowOpen, setDifferentialScanWindowOpen] = useState(false)
    const [modelLoaderWindowOpen, setModelLoaderWindowOpen] = useState(false)
    const [biasManagerWindowOpen, setBiasManagerWindowOpen] = useState(false)
    const [qualityTestWindowOpen, setQualityTestWindowOpen] = useState(false)
    const [tokenActivationWindowOpen, setTokenActivationWindowOpen] = useState(false)
    const [inferenceWindowOpen, setInferenceWindowOpen] = useState(false)
    const [inferenceStatusWindowOpen, setInferenceStatusWindowOpen] = useState(false)
    const [inferenceExists, setInferenceExists] = useState(false)
    const [inferencePrompt, setInferencePrompt] = useState("")
    const [status, setStatus] = useState("")
    const [scanRes, setScanRes] = useState<ScanResult>(EMPTY_SCAN)
    const [modelName, setModelName] = useState("")
    const [scaledActivations, setScaledActivations] = useState(true)
    const [biases, setProjectBiases] = useState(project.biases)
    const [isSteering, setIsSteering] = useState(false)

    const savedScanRes = useRef<ScanResult | null>(null)
    const savedNPerLayerOverride = useRef<number[] | null>(null)

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

    const handleActivationsUpdate = (activations:number[][], highestLayer:number, perLayerOverride?:number[]) => {
        setScanRes({
            name: "",
            highest_layer: highestLayer,
            layer_diffs: activations,
            vector: activations[highestLayer] ?? []
        })
        setNPerLayerOverride(perLayerOverride ?? null)
    }

    const openTokenActivationWindow = () => {
        savedScanRes.current = scanRes
        savedNPerLayerOverride.current = nPerLayerOverride
        setTokenActivationWindowOpen(true)
    }

    const restoreActivations = () => {
        if (savedScanRes.current) setScanRes(savedScanRes.current)
        setNPerLayerOverride(savedNPerLayerOverride.current)
    }

    const handleInferenceStart = (prompt:string) => {
        setInferencePrompt(prompt)
        setInferenceExists(true)
        setInferenceWindowOpen(false)
        setInferenceStatusWindowOpen(true)
    }

    useEffect(() => {
        InitApp(setStatus).then(updateModelInfo)
    }, [])

    const activeNPerLayer = nPerLayerOverride ?? nPerLayer

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <NetworkVisualizer
                numLayers={numLayers}
                nPerLayer={activeNPerLayer}
                nActivations={scanRes.layer_diffs}
                highestLayer={scanRes.highest_layer}
                rawMode={!scaledActivations}
            />
            <NPTopBar>
                <p>Current model loaded: {modelName}</p>
                <NPButton onClick={() => setModelLoaderWindowOpen(true)}>Load Model</NPButton>
                <NPButton onClick={() => setIsSteering(!isSteering)}>Steering [{isSteering ? "ON" : "OFF"}]</NPButton>
                <NPButton onClick={() => setScaledActivations(!scaledActivations)}>
                    Scaled Activations [{scaledActivations ? "ON" : "OFF"}]
                </NPButton>
                {!isSteering ? (
                    <>
                        <NPButton
                            onClick={() => setDifferentialScanWindowOpen(true)}
                            disabled={!Client.model.loaded}
                        >
                            Differential Scan
                        </NPButton>
                        <NPButton onClick={() => setBiasManagerWindowOpen(true)}>Bias Manager</NPButton>
                        <NPButton
                            onClick={() => setQualityTestWindowOpen(true)}
                            disabled={!Client.model.loaded}
                        >
                            Quality Test
                        </NPButton>
                        <NPButton
                            onClick={openTokenActivationWindow}
                            disabled={!Client.model.loaded}
                        >
                            Token Activations
                        </NPButton>
                    </>
                ) : (
                    <>
                        <NPButton
                            onClick={() => setInferenceWindowOpen(true)}
                            disabled={!Client.model.loaded}
                        >
                            Inference
                        </NPButton>
                        <NPButton
                            onClick={() => setInferenceStatusWindowOpen(true)}
                            disabled={!inferenceExists}
                        >
                            Inference Status
                        </NPButton>
                    </>
                )}
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
            {tokenActivationWindowOpen && (
                <TokenActivationWindow
                    onClose={() => setTokenActivationWindowOpen(false)}
                    biases={biases}
                    onBiasesChange={setBiases}
                    onActivationsUpdate={handleActivationsUpdate}
                    onRestoreActivations={restoreActivations}
                />
            )}
            {inferenceWindowOpen && (
                <InferenceWindow
                    onClose={() => setInferenceWindowOpen(false)}
                    biases={biases}
                    onInferenceStart={handleInferenceStart}
                />
            )}
            {inferenceStatusWindowOpen && (
                <InferenceStatusWindow
                    onClose={() => setInferenceStatusWindowOpen(false)}
                    biases={biases}
                    prompt={inferencePrompt}
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