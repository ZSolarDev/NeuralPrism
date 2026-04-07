import { useState } from "react"
import { FeatureBias } from "../api/client"
import { Input } from "@/components/ui/input"

export type ConditionOp = "AND" | "OR" | "AND NOT" | "OR NOT" | null

export type ConditionTerm = {
    kind:"term"
    biasIndex:number
    threshold:number
    op:ConditionOp
}

export type ConditionGroup = {
    kind:"group"
    nodes:ConditionNode[]
    op:ConditionOp
}

export type ConditionNode = ConditionTerm | ConditionGroup

export function nodeToExpr(node:ConditionNode):string {
    if (node.kind === "term") {
        return `${node.biasIndex}[${node.threshold}]`
    } else {
        const inner = node.nodes.map((n, i) => {
            const expr = nodeToExpr(n)
            const wrapped = n.kind === "group" ? `(${expr})` : expr
            return i === 0 ? wrapped : `${n.op} ${wrapped}`
        }).join(" ")
        return inner
    }
}

export function rootToExpr(nodes:ConditionNode[]):string {
    return nodes.map((n, i) => {
        const expr = nodeToExpr(n)
        const wrapped = n.kind === "group" ? `(${expr})` : expr
        return i === 0 ? wrapped : `${n.op} ${wrapped}`
    }).join(" ")
}

export function parseNodes(expr:string):ConditionNode[] {
    if (!expr || expr.trim() === "") return []
    const nodes:ConditionNode[] = []
    let i = 0

    const parseOp = ():ConditionOp => {
        const remaining = expr.slice(i).trimStart()
        const offset = expr.slice(i).length - remaining.length
        i += offset
        for (const op of ["AND NOT", "OR NOT", "AND", "OR"]) {
            if (remaining.startsWith(op + " ") || remaining.startsWith(op + "(")) {
                i += op.length
                while (i < expr.length && expr[i] === " ") i++
                return op as ConditionOp
            }
        }
        return null
    }

    const parseTerm = (op:ConditionOp):ConditionTerm | null => {
        const match = /^(-?\d+(?:\.\d+)?)\[([-\d.]+)\]/.exec(expr.slice(i))
        if (!match) return null
        i += match[0].length
        return { kind: "term", biasIndex: parseInt(match[1]), threshold: parseFloat(match[2]), op }
    }

    const parseGroup = (op:ConditionOp):ConditionGroup => {
        i++ // skip (
        const inner:ConditionNode[] = []
        while (i < expr.length && expr[i] !== ")") {
            while (i < expr.length && expr[i] === " ") i++
            if (expr[i] === ")") break
            const childOp = inner.length === 0 ? null : parseOp()
            while (i < expr.length && expr[i] === " ") i++
            if (expr[i] === "(") {
                inner.push(parseGroup(childOp))
            } else {
                const term = parseTerm(childOp)
                if (term) inner.push(term)
                else break
            }
        }
        if (i < expr.length && expr[i] === ")") i++ // skip )
        return { kind: "group", nodes: inner, op }
    }

    while (i < expr.length) {
        while (i < expr.length && expr[i] === " ") i++
        if (i >= expr.length) break
        const op = nodes.length === 0 ? null : parseOp()
        while (i < expr.length && expr[i] === " ") i++
        if (expr[i] === "(") {
            nodes.push(parseGroup(op))
        } else {
            const term = parseTerm(op)
            if (term) nodes.push(term)
            else break
        }
    }

    return nodes
}

const opSelectStyle = {
    background: "#252525",
    border: "1px solid #7C7C7C",
    color: "#DDD",
    fontSize: "0.75rem",
    borderRadius: "4px",
    padding: "2px 4px",
    height: "24px",
    width: "80px",
    flexShrink: 0,
    cursor: "pointer"
}

const addBtnStyle = {
    background: "transparent",
    border: "1px dashed #7C7C7C",
    color: "#A7A7A7",
    fontSize: "0.75rem",
    borderRadius: "4px",
    padding: "2px 8px",
    cursor: "pointer",
    height: "24px"
}

let listCounter = 0

function OpSelect({ op, onChange, isFirst }: {
    op:ConditionOp
    onChange:(op:ConditionOp) => void
    isFirst:boolean
}) {
    if (isFirst) return <span style={{ color: "#7C7C7C", fontSize: "0.75rem", width: "80px", flexShrink: 0 }}>IF</span>
    return (
        <select value={op ?? "AND"} onChange={e => onChange(e.target.value as ConditionOp)} style={opSelectStyle}>
            <option value="AND">AND</option>
            <option value="OR">OR</option>
            <option value="AND NOT">AND NOT</option>
            <option value="OR NOT">OR NOT</option>
        </select>
    )
}

function NodeList({ nodes, onChange, biases, selfIndex, depth }: {
    nodes:ConditionNode[]
    onChange:(nodes:ConditionNode[]) => void
    biases:{ b:FeatureBias, j:number }[]
    selfIndex:number
    depth:number
}) {
    const [dragType] = useState(() => `np-condition-${listCounter++}`)
    const [dragOver, setDragOver] = useState<number | null>(null)

    const updateNode = (i:number, node:ConditionNode) => onChange(nodes.map((n, j) => j === i ? node : n))
    const removeNode = (i:number) => {
        const next = nodes.filter((_, j) => j !== i)
        if (next.length > 0) next[0] = { ...next[0], op: null }
        onChange(next)
    }

    const addTerm = () => {
        const first = biases[0]
        if (!first) return
        onChange([...nodes, { kind: "term", biasIndex: first.j, threshold: 0.3, op: nodes.length === 0 ? null : "AND" }])
    }

    const addGroup = () => {
        onChange([...nodes, { kind: "group", nodes: [], op: nodes.length === 0 ? null : "AND" }])
    }

    const onDragStart = (e:React.DragEvent, i:number) => {
        e.stopPropagation()
        e.dataTransfer.setData(dragType, String(i))
    }
    const onDragOver = (e:React.DragEvent, i:number) => {
        if (!e.dataTransfer.types.includes(dragType)) return
        e.stopPropagation()
        e.preventDefault()
        setDragOver(i)
    }
    const onDragLeave = (e:React.DragEvent) => {
        if (!e.dataTransfer.types.includes(dragType)) return
        e.stopPropagation()
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOver(null)
    }
    const onDrop = (e:React.DragEvent, i:number) => {
        if (!e.dataTransfer.types.includes(dragType)) return
        e.stopPropagation()
        setDragOver(null)
        const from = parseInt(e.dataTransfer.getData(dragType))
        if (isNaN(from) || from === i) return
        if (from === 0 || i === 0) return
        const reordered = [...nodes]
        const [moved] = reordered.splice(from, 1)
        reordered.splice(i, 0, moved)
        onChange(reordered)
    }
    const onDragEnd = (e:React.DragEvent) => {
        e.stopPropagation()
        setDragOver(null)
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {nodes.length === 0 && depth === 0 && (
                <span style={{ color: "#555", fontSize: "0.75rem" }}>No condition: always applies</span>
            )}
            {nodes.map((node, i) => (
                <div
                    key={i}
                    draggable
                    onDragStart={e => onDragStart(e, i)}
                    onDragOver={e => onDragOver(e, i)}
                    onDragLeave={e => onDragLeave(e)}
                    onDrop={e => onDrop(e, i)}
                    onDragEnd={e => onDragEnd(e)}
                    style={{ opacity: dragOver === i ? 0.4 : 1, transition: "opacity 0.1s ease" }}
                >
                    {node.kind === "term" ? (
                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <span style={{ color: i === 0 ? "#3a3a3a" : "#7C7C7C", cursor: i === 0 ? "default" : "grab", fontSize: "0.75rem", userSelect: "none", letterSpacing: "1px", flexShrink: 0 }}>::</span>
                            <OpSelect op={node.op} onChange={op => updateNode(i, { ...node, op })} isFirst={i === 0} />
                            <select
                                value={node.biasIndex}
                                onChange={e => updateNode(i, { ...node, biasIndex: parseInt(e.target.value) })}
                                onDragOver={e => e.stopPropagation()}
                                style={{ ...opSelectStyle, flex: 1, width: "auto" }}
                            >
                                {biases.map(({ b, j }) => (
                                    <option key={j} value={j}>{b.name || `Bias ${j}`}</option>
                                ))}
                            </select>
                            <Input
                                type="number"
                                value={node.threshold}
                                step={0.05}
                                max={1}
                                onDragOver={e => e.stopPropagation()}
                                onChange={e => updateNode(i, { ...node, threshold: parseFloat(e.target.value) || 0 })}
                                style={{
                                    border: "1px solid #7C7C7C",
                                    padding: "2px 4px",
                                    fontSize: "0.75rem",
                                    backgroundColor: "#252525",
                                    height: "24px",
                                    width: "56px",
                                    flexShrink: 0
                                }}
                                className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                            />
                            <span
                                onClick={() => removeNode(i)}
                                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                                style={{ cursor: "pointer", opacity: "0.5", fontSize: "0.75rem", transition: "opacity 0.15s ease", flexShrink: 0 }}
                            >✕</span>
                        </div>
                    ) : (
                        <div style={{
                            border: "1px solid #3a3a3a",
                            borderRadius: "6px",
                            padding: "6px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            marginLeft: `${depth * 4}px`
                        }}>
                            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                <span style={{ color: "#7C7C7C", cursor: "grab", fontSize: "0.75rem", userSelect: "none", letterSpacing: "1px", flexShrink: 0 }}>::</span>
                                <OpSelect op={node.op} onChange={op => updateNode(i, { ...node, op })} isFirst={i === 0} />
                                <span style={{ color: "#7C7C7C", fontSize: "0.75rem", flex: 1 }}>group</span>
                                <span
                                    onClick={() => removeNode(i)}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                                    style={{ cursor: "pointer", opacity: "0.5", fontSize: "0.75rem", transition: "opacity 0.15s ease", flexShrink: 0 }}
                                >✕</span>
                            </div>
                            <NodeList
                                nodes={node.nodes}
                                onChange={newNodes => updateNode(i, { ...node, nodes: newNodes })}
                                biases={biases}
                                selfIndex={selfIndex}
                                depth={depth + 1}
                            />
                        </div>
                    )}
                </div>
            ))}
            <div style={{ display: "flex", gap: "4px" }}>
                <button onClick={addTerm} style={addBtnStyle}>+ term</button>
                <button onClick={addGroup} style={addBtnStyle}>+ group</button>
            </div>
        </div>
    )
}

function ConditionEditor({ item, i, biases, update }: {
    item:FeatureBias
    i:number
    biases:FeatureBias[]
    update:(val:FeatureBias) => void
}) {
    const otherBiases = biases.map((b, j) => ({ b, j }))
    const nodes:ConditionNode[] = parseNodes(item.condition)

    const onChange = (newNodes:ConditionNode[]) => {
        update({ ...item, condition: rootToExpr(newNodes) })
    }

    if (otherBiases.length === 0) return (
        <span style={{ color: "#555", fontSize: "0.75rem" }}>No other biases to condition on</span>
    )

    return (
        <NodeList
            nodes={nodes}
            onChange={onChange}
            biases={otherBiases}
            selfIndex={i}
            depth={0}
        />
    )
}

export default ConditionEditor