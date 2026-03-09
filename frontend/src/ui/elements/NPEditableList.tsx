import { Button } from "@/components/ui/button"
import { useState } from "react"
import NPConfirmDialog from "./NPConfirmDialog"
import { createPortal } from "react-dom"

const LIST_ID = "np-editable-list"

function NPEditableList<T>({ label, items, onChange, renderItem, onAdd, showAdd = true, confirmRemove }: {
    label:string
    items:T[]
    onChange:(items:T[]) => void
    renderItem:(item:T, index:number, update:(val:T) => void) => React.ReactNode
    onAdd?:() => T
    showAdd?:boolean
    confirmRemove?:(item:T) => string | false
}) {
    const add = () => { if (onAdd) onChange([...items, onAdd()]) }
    const remove = (i:number) => onChange(items.filter((_, j) => j !== i))
    const update = (i:number, val:T) => onChange(items.map((v, j) => j === i ? val : v))

    const [dragOver, setDragOver] = useState<number | null>(null)
    const [pendingRemove, setPendingRemove] = useState<{ index:number, message:string } | null>(null)

    const handleRemove = (i:number) => {
        if (confirmRemove) {
            const msg = confirmRemove(items[i])
            if (msg !== false) {
                setPendingRemove({ index: i, message: msg })
                return
            }
        }
        remove(i)
    }

    const confirmDo = () => {
        if (pendingRemove !== null) remove(pendingRemove.index)
        setPendingRemove(null)
    }

    const confirmCancel = () => setPendingRemove(null)

    const onDragStart = (e:React.DragEvent, i:number) => {
        e.stopPropagation()
        e.dataTransfer.setData(LIST_ID, String(i))
    }
    const onDragOver = (e:React.DragEvent, i:number) => {
        if (!e.dataTransfer.types.includes(LIST_ID)) return
        e.stopPropagation()
        e.preventDefault()
        setDragOver(i)
    }
    const onDragLeave = (e:React.DragEvent) => {
        if (!e.dataTransfer.types.includes(LIST_ID)) return
        e.stopPropagation()
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOver(null)
    }
    const onDrop = (e:React.DragEvent, i:number) => {
        if (!e.dataTransfer.types.includes(LIST_ID)) return
        e.stopPropagation()
        setDragOver(null)
        const from = parseInt(e.dataTransfer.getData(LIST_ID))
        if (isNaN(from) || from === i) return
        const reordered = [...items]
        const [moved] = reordered.splice(from, 1)
        reordered.splice(i, 0, moved)
        onChange(reordered)
    }
    const onDragEnd = (e:React.DragEvent) => {
        e.stopPropagation()
        setDragOver(null)
    }

    return (
        <>
            {pendingRemove && createPortal(
                <NPConfirmDialog
                    message={pendingRemove.message}
                    onConfirm={confirmDo}
                    onCancel={confirmCancel}
                />,
                document.body
            )}
            <div style={{ border: "1px solid #7C7C7C", borderRadius: "8px", padding: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ color: "#A7A7A7" }}>{label}</span>
                {items.map((item, i) => (
                    <div
                        key={i}
                        draggable
                        onDragStart={e => onDragStart(e, i)}
                        onDragOver={e => onDragOver(e, i)}
                        onDragLeave={e => onDragLeave(e)}
                        onDrop={e => onDrop(e, i)}
                        onDragEnd={e => onDragEnd(e)}
                        style={{ display: "flex", gap: "8px", alignItems: "center", opacity: dragOver === i ? 0.4 : 1, transition: "opacity 0.1s ease" }}
                    >
                        <span style={{ color: "#7C7C7C", cursor: "grab", fontSize: "0.85rem", userSelect: "none", letterSpacing: "1px" }}>::</span>
                        {renderItem(item, i, (val) => update(i, val))}
                        <span
                            onClick={() => handleRemove(i)}
                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                            style={{ cursor: "pointer", opacity: "0.5", transition: "opacity 0.15s ease" }}
                        >✕</span>
                    </div>
                ))}
                {showAdd && onAdd && (
                    <Button
                        variant="outline"
                        onClick={add}
                        style={{ border: "1px dashed #7C7C7C", color: "#A7A7A7", height: "31px", background: "transparent" }}
                        className="w-full text-sm hover:bg-white/10 hover:text-white"
                    >+ add</Button>
                )}
            </div>
        </>
    )
}

export default NPEditableList