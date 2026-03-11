import { useState, useRef, useEffect } from "react"
import { topBarHeightRef } from "./NPTopBar"

const clamp = (val:number, min:number, max:number) => Math.max(min, Math.min(max, val))

const BORDER = 6
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Bounds = { x:number, y:number, w:number, h:number }

const defaultBounds = (): Bounds => ({
    x: 0,
    y: topBarHeightRef.current,
    w: window.innerWidth,
    h: window.innerHeight - topBarHeightRef.current,
})

function NPWindow({ name, children, onClose, defaultPos, defaultSize, bounds, fitToBounds }: {
    name:string
    children:React.ReactNode
    onClose?:() => void
    defaultPos?:{ x:number, y:number }
    defaultSize?:{ width:number, height:number }
    bounds?:Bounds | (() => Bounds)
    fitToBounds?:boolean
}) {
    const [pos, setPos] = useState(defaultPos ?? { x: 100, y: topBarHeightRef.current + 10 })
    const sizeRef = useRef(defaultSize ?? { width: 300, height: 200 })
    const [size, setSize] = useState(defaultSize ?? { width: 300, height: 200 })
    const boundsRef = useRef(bounds)
    const fitToBoundsRef = useRef(fitToBounds)

    const updateSize = (newSize:{ width:number, height:number }) => {
        sizeRef.current = newSize
        setSize(newSize)
    }

    const getBounds = (): Bounds =>
        typeof boundsRef.current === 'function'
            ? boundsRef.current()
            : boundsRef.current ?? defaultBounds()

    const maxW = () => getBounds().w
    const maxH = () => getBounds().h
    const minX = () => getBounds().x
    const minY = () => getBounds().y
    const maxX = () => { const b = getBounds(); return b.x + b.w - sizeRef.current.width }
    const maxY = () => { const b = getBounds(); return b.y + b.h - sizeRef.current.height }

    const dragging = useRef(false)
    const dragOffset = useRef({ x: 0, y: 0 })
    const resizing = useRef(false)
    const resizeDir = useRef<ResizeDir>('se')
    const resizeStart = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 })

    const onTitleMouseDown = (e:React.MouseEvent) => {
        e.stopPropagation()
        dragging.current = true
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
        window.addEventListener('mousemove', handleDragMove)
        window.addEventListener('mouseup', handleDragUp)
    }
    const handleDragMove = (e:MouseEvent) => {
        if (!dragging.current) return
        setPos({
            x: clamp(e.clientX - dragOffset.current.x, minX(), maxX()),
            y: clamp(e.clientY - dragOffset.current.y, minY(), maxY()),
        })
    }
    const handleDragUp = () => {
        dragging.current = false
        window.removeEventListener('mousemove', handleDragMove)
        window.removeEventListener('mouseup', handleDragUp)
    }

    const onResizeMouseDown = (e:React.MouseEvent, dir:ResizeDir) => {
        e.stopPropagation()
        resizing.current = true
        resizeDir.current = dir
        resizeStart.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y, w: sizeRef.current.width, h: sizeRef.current.height }
        window.addEventListener('mousemove', handleResizeMove)
        window.addEventListener('mouseup', handleResizeUp)
    }
    const handleResizeMove = (e:MouseEvent) => {
        if (!resizing.current) return
        const { mx, my, x, y, w, h } = resizeStart.current
        const dx = e.clientX - mx
        const dy = e.clientY - my
        const dir = resizeDir.current
        let nx = x, ny = y, nw = w, nh = h
        if (dir.includes('e')) nw = Math.max(150, w + dx)
        if (dir.includes('s')) nh = Math.max(100, h + dy)
        if (dir.includes('w')) { nw = Math.max(150, w - dx); nx = x + (w - nw) }
        if (dir.includes('n')) { nh = Math.max(100, h - dy); ny = y + (h - nh) }

        const clampedX = clamp(nx, minX(), maxX() + sizeRef.current.width - nw)
        const clampedY = clamp(ny, minY(), maxY() + sizeRef.current.height - nh)
        if (dir.includes('w')) nw += nx - clampedX
        if (dir.includes('n')) nh += ny - clampedY

        setPos({ x: clampedX, y: clampedY })
        updateSize({ width: Math.max(150, nw), height: Math.max(100, nh) })
    }
    const handleResizeUp = () => {
        resizing.current = false
        window.removeEventListener('mousemove', handleResizeMove)
        window.removeEventListener('mouseup', handleResizeUp)
    }

    const applyFitAndClamp = () => {
        if (fitToBoundsRef.current) {
            const w = maxW()
            const h = maxH()
            const newW = Math.min(sizeRef.current.width, w)
            const newH = Math.min(sizeRef.current.height, h)
            if (newW !== sizeRef.current.width || newH !== sizeRef.current.height)
                updateSize({ width: newW, height: newH })
        }
        setPos(p => ({ x: clamp(p.x, minX(), maxX()), y: clamp(p.y, minY(), maxY()) }))
    }

    useEffect(() => {
        applyFitAndClamp()
        window.addEventListener('resize', applyFitAndClamp)
        window.addEventListener('topbarresize', applyFitAndClamp)
        return () => {
            window.removeEventListener('resize', applyFitAndClamp)
            window.removeEventListener('topbarresize', applyFitAndClamp)
        }
    }, [])

    const edge = (dir:ResizeDir, style:React.CSSProperties) => (
        <div onMouseDown={e => onResizeMouseDown(e, dir)} style={{ position: 'absolute', ...style }} />
    )

    return (
        <div style={{
            width: size.width,
            height: size.height,
            position: "absolute",
            top: pos.y,
            left: pos.x,
            background: "#2C2C2C",
            border: "1px solid #7C7C7C",
            color: "#FFFFFF",
            fontFamily: "monospace",
            userSelect: "none",
            zIndex: 10,
            borderRadius: "6px",
            overflow: "hidden",
            boxSizing: "border-box",
        }}>
            <div
                onMouseDown={onTitleMouseDown}
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 12px",
                    cursor: "move",
                    borderBottom: "1px solid #7C7C7C",
                }}
            >
                <span style={{ fontWeight: "bold" }}>{name}</span>
                <span
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => onClose?.()}
                    style={{ cursor: "pointer", lineHeight: 1, opacity: 0.7 }}
                >✕</span>
            </div>

            <div style={{ padding: "12px", width: "100%", height: "calc(100% - 33px)", boxSizing: "border-box", overflow: "auto" }}>
                {children}
            </div>

            {edge('n',  { top: 0, left: BORDER, right: BORDER, height: BORDER, cursor: 'n-resize' })}
            {edge('s',  { bottom: 0, left: BORDER, right: BORDER, height: BORDER, cursor: 's-resize' })}
            {edge('w',  { left: 0, top: BORDER, bottom: BORDER, width: BORDER, cursor: 'w-resize' })}
            {edge('e',  { right: 0, top: BORDER, bottom: BORDER, width: BORDER, cursor: 'e-resize' })}
            {edge('nw', { top: 0, left: 0, width: BORDER, height: BORDER, cursor: 'nw-resize' })}
            {edge('ne', { top: 0, right: 0, width: BORDER, height: BORDER, cursor: 'ne-resize' })}
            {edge('sw', { bottom: 0, left: 0, width: BORDER, height: BORDER, cursor: 'sw-resize' })}
            {edge('se', { bottom: 0, right: 0, width: BORDER, height: BORDER, cursor: 'se-resize' })}
        </div>
    )
}

export default NPWindow