import NPWindow from "./elements/NPWindow"
import NPButton fro "../api/cli
back } from "react"

//
        const above = tokenSims[i] >= median
        if (!cur || cur.isAbove !== above) {
            cur = { sims: [], startIdx: i, endIdx: i, isAbove: above }
            runs.push(cur)
        }
        cur.sims.push(tokenSims[i])
        cur.endIdx = i
    }TMLDivElement | null>
    width: number
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const draw = useCallback(() => {
        const canvas = canvasRef.current
        const scroll ing, setRunning] = useState(false)
    const [streamingContent, setStreamingContent] = useState("")
    const [template, setTemplate] = useState<ChatTemplate | null>(null)
    const [presets, setPresetslient.getInferenceProgress()
                if (d.tokens.length > knownCount) {
                    knownCount = d.tokens.length
                    streamRef.current = d.tokens.join("")
                    setStreamingContent(streamRef.current)
                }
                if (d.done || d.cancelled) {
                    stopPolling()
                    const finalContent = streamRef.current
                    setStreamingContent("")
                    onMessagesChange([...sentMessagesRef.current, { role: "assistant", content: finalContent }])
                    setRunning(false)
                }
            }, 150)
        })efined) continue
                const perToken = tokenSims.map(row => row[b] ?? 0.5)
                biasMap.set(biasIdx, { regions: computeRegions(perToken), tokenSims: perToken })
            }
            next.set(msgIndex, biasMap)
            return next
        })
    }

    const send = async (overrideMessages?: ChatMessage[]) => {
        if (!input.trim() || running || !template) return

        const base = overrideMesstring, sliceIndex: number) => {
        if (running) return
        setInput(msgContent)
        onMessagesChange(messages.slice(0, sliceIndex))
    }

    const handleReset = () => {
        if (running) reDragging.current = false }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
    }, [])

    if (!template) {
        return (
            <NPWindow name="Chaay: "flex", overflow: "hidden" }}>

                    ChatWindow