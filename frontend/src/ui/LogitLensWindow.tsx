import NPWindow from "./elements/NPWindow"
import { useState, useEffect, useRef } from "react"

type LayerPrediction = {
    layer:number
    top:{ token:string, prob:number }[]
}

function AnimatedArrow() {
    const [offset, setOffset] = useState(0)
    useEffect(() => {
        let frame:number
        let start:number | null = null
        const animate = (ts:number) => {
            if (!start) start = ts
            const elapsed = (ts - start) % 1200
            setOffset(elapsed / 1200)
            frame = requestAnimationFrame(animate)
        }
        frame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frame)
    }, [])

    const dots = [0, 0.33, 0.66]
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "0 4px", flexShrink: 0 }}>
            {dots.map((phase, i) => {
                const t = ((offset + phase) % 1)
                const opacity = 0.15 + 0.85 * Math.sin(t * Math.PI)
                return (
                    <div key={i} style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        background: "#5a5a5a",
                        opacity,
                        transition: "opacity 0.05s"
                    }} />
                )
            })}
        </div>
    )
}

function TokenCard({ token, prob }: { token:string, prob:number }) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            opacity: 1,
            transition: "opacity 0.2s"
        }}>
            <div style={{
                background: "#252525",
                border: `1px solid #3a3a3a`,
                borderRadius: "4px",
                padding: "3px 7px",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: "#DDD",
                whiteSpace: "nowrap",
                maxWidth: "100px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "center"
            }}>
                {token.trim() == "" ? "⠀" : token}
            </div>
            <div style={{ height: "3px", background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{
                    height: "100%",
                    width: `${Math.round(prob * 100)}%`,
                    background: `hsl(${120 * prob}, 60%, 45%)`,
                    borderRadius: "2px",
                    transition: "width 0.3s ease"
                }} />
            </div>
        </div>
    )
}

function LayerBlock({ layer, predictions, isLast }: {
    layer:number
    predictions:{ token:string, prob:number }[]
    isLast:boolean
}) {

    return (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                <span style={{ color: "#444", fontSize: "0.65rem", fontFamily: "monospace", marginBottom: "2px" }}>
                    L{layer}
                </span>
                {predictions.map((p, i) => (
                    <TokenCard key={i} token={p.token} prob={p.prob}/>
                ))}
            </div>
            {!isLast && <AnimatedArrow />}
        </div>
    )
}

function LogitLensWindow({ onClose, token, layers }: {
    onClose:() => void
    token:string
    layers:LayerPrediction[]
}) {
    const scrollRef = useRef<HTMLDivElement>(null)

    return (
        <NPWindow
            name={`Logit Lens: "${token}"`}
            onClose={onClose}
            defaultSize={{ width: Math.min(window.innerWidth - 40, 900), height: 220 }}
            bounds={() => ({ x: 0, y: 35, w: window.innerWidth, h: window.innerHeight - 35 })}
            fitToBounds={true}
        >
            <div
                ref={scrollRef}
                style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "flex-start",
                    overflowX: "auto",
                    overflowY: "hidden",
                    paddingBottom: "6px",
                    gap: "0px"
                }}
            >
                {layers.map((layer, i) => (
                    <LayerBlock
                        key={layer.layer}
                        layer={layer.layer}
                        predictions={layer.top}
                        isLast={i === layers.length - 1}
                    />
                ))}
            </div>
        </NPWindow>
    )
}

export default LogitLensWindow