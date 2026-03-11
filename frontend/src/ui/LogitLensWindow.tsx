import NPWindow from "./elements/NPWindow"
import React, { useRef } from "react"

type LayerPrediction = {
    layer: number
    top: { token: string, prob: number }[]
}

const COL_W = 110
const ARROW_W = 24
const LABEL_H = 16
const CHIP_H = 20
const CHIP_GAP = 4
const CARD_H = 32
const TOPBAR_H = 32
const PADDING_V = 24
const SCROLLBAR_H = 8
const LABEL_CHIPS_GAP = 6
const MIN_CARD_GAP = 8
const EXTRA = 32  // breathing room below cards

function TokenCard({ token, prob }: { token: string, prob: number }) {
    return (
        <div style={{
            width: COL_W - 10,
            flexShrink: 0,
            flexGrow: 0,
            display: "flex",
            flexDirection: "column",
            gap: "3px",
        }}>
            <div style={{
                background: "#252525",
                border: "1px solid #3a3a3a",
                borderRadius: "4px",
                padding: "3px 7px",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: "#DDD",
                whiteSpace: "nowrap",
                width: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "center",
                boxSizing: "border-box",
            }}>
                {token.trim() === "" ? "⠀" : token}
            </div>
            <div style={{ height: "4px", width: COL_W - 10, flexShrink: 0, background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{
                    height: "100%",
                    width: `${Math.round(prob * 100)}%`,
                    background: `hsl(${120 * prob}, 60%, 45%)`,
                    borderRadius: "2px",
                    transition: "width 0.3s ease",
                }} />
            </div>
        </div>
    )
}

function LogitLensWindow({ onClose, token, layers, layerSublabels }: {
    onClose: () => void
    token: string
    layers: LayerPrediction[]
    layerSublabels?: Record<number, React.ReactNode>
}) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const numLayers = layers.length
    const numCards = layers[0]?.top.length ?? 3

    const getChips = (layerIndex: number): React.ReactNode[] => {
        const sublabel = layerSublabels?.[layers[layerIndex].layer]
        if (!sublabel) return []
        const children = ((sublabel as React.ReactElement)?.props as any)?.children
        return Array.isArray(children) ? children : [children]
    }

    const maxChips = Math.max(0, ...layers.map((_, i) => getChips(i).length))

    // Window height = tallest column:
    // label + gap + maxChips * chipH + (maxChips-1)*chipGap + (if chips) gap + numCards*cardH + extra
    const tallestColH =
        LABEL_H +
        LABEL_CHIPS_GAP +
        (maxChips > 0 ? maxChips * CHIP_H + (maxChips - 1) * CHIP_GAP + LABEL_CHIPS_GAP : 0) +
        numCards * CARD_H +
        (numCards - 1) * MIN_CARD_GAP +
        EXTRA

    const windowHeight = TOPBAR_H + PADDING_V + tallestColH + SCROLLBAR_H
    const totalWidth = numLayers * COL_W + (numLayers - 1) * ARROW_W

    return (
        <NPWindow
            name={`Logit Lens: "${token}"`}
            onClose={onClose}
            defaultSize={{ width: 900, height: windowHeight }}
            fitToBounds={true}
        >
            {/* Single row of fully self-contained columns + arrows.
                alignItems stretch makes every column the same total height.
                Each column manages its own label, chips, and card gaps. */}
            <div
                ref={scrollRef}
                style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "flex-start",
                    boxSizing: "border-box",
                    paddingBottom: SCROLLBAR_H,
                    overflowX: "auto",
                    overflowY: "hidden",
                }}
            >
                {layers.map((layer, i) => {
                    const chips = getChips(i)
                    return (
                        <React.Fragment key={layer.layer}>
                            <div style={{
                                width: COL_W,
                                height: tallestColH,
                                flexShrink: 0,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "flex-start",
                            }}>
                                {/* Label */}
                                <div style={{ height: LABEL_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ color: "#444", fontSize: "0.65rem", fontFamily: "monospace" }}>
                                        L{layer.layer}
                                    </span>
                                </div>

                                <div style={{ height: LABEL_CHIPS_GAP, flexShrink: 0 }} />

                                {/* Chips */}
                                {chips.length > 0 && (
                                    <>
                                        <div style={{ display: "flex", flexDirection: "column", gap: CHIP_GAP, flexShrink: 0, alignItems: "center" }}>
                                            {chips.map((chip, ci) => (
                                                <div key={ci} style={{ height: CHIP_H, display: "flex", alignItems: "center" }}>
                                                    {chip}
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ height: LABEL_CHIPS_GAP, flexShrink: 0 }} />
                                    </>
                                )}

                                {/* Top spacer */}
                                <div style={{ height: (maxChips - chips.length) * (CHIP_H + CHIP_GAP), flexShrink: 0 }} />

                                {/* Cards */}
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: MIN_CARD_GAP, flexShrink: 0 }}>
                                    {layer.top.map((p, cardIdx) => (
                                        <TokenCard key={cardIdx} token={p.token} prob={p.prob} />
                                    ))}
                                </div>
                            </div>

                            {/* Arrow between columns */}
                            {i < numLayers - 1 && (
                                <div style={{
                                    width: ARROW_W,
                                    height: tallestColH,
                                    flexShrink: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#3a3a3a",
                                    fontSize: "1rem",
                                    userSelect: "none",
                                }}>
                                    →
                                </div>
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        </NPWindow>
    )
}

export default LogitLensWindow