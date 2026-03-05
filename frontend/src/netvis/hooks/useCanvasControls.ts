import { useRef, useEffect } from 'react'

export function useCanvasControls(getCanvas: () => HTMLCanvasElement | null) {
    const targetOffset = useRef({ x: 0, y: 0 })
    const targetScale = useRef(1)
    const isDragging = useRef(false)
    const lastPointer = useRef({ x: 0, y: 0 })
    const curScaleRef = useRef(1)
    const curOffsetRef = useRef({ x: 0, y: 0 })

    useEffect(() => {
        let canvas: HTMLCanvasElement | null = null

        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            const oldScale = targetScale.current
            const newScale = Math.max(0.05, Math.min(5, oldScale * Math.pow(0.999, e.deltaY)))
            targetScale.current = newScale
            const mx = e.clientX - rect.left - rect.width / 2
            const my = e.clientY - rect.top - rect.height / 2
            const scaleFactor = newScale / oldScale
            targetOffset.current = {
                x: (targetOffset.current.x - mx) * scaleFactor + mx,
                y: (targetOffset.current.y - my) * scaleFactor + my,
            }
        }

        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 2) return
            e.preventDefault()
            isDragging.current = true
            lastPointer.current = { x: e.clientX, y: e.clientY }
            curOffsetRef.current = { ...targetOffset.current }
        }

        const onPointerMove = (e: PointerEvent) => {
            if (!isDragging.current) return
            const dx = e.clientX - lastPointer.current.x
            const dy = e.clientY - lastPointer.current.y
            lastPointer.current = { x: e.clientX, y: e.clientY }
            targetOffset.current = {
                x: targetOffset.current.x + dx,
                y: targetOffset.current.y + dy,
            }
        }

        const onPointerUp = (e: PointerEvent) => {
            if (e.button !== 2) return
            isDragging.current = false
        }

        const tryAttach = () => {
            canvas = getCanvas()
            if (canvas) {
                canvas.addEventListener('wheel', onWheel, { passive: false })
                canvas.addEventListener('contextmenu', e => e.preventDefault())
                canvas.addEventListener('pointerdown', onPointerDown)
                canvas.addEventListener('pointermove', onPointerMove)
                canvas.addEventListener('pointerup', onPointerUp)
                canvas.addEventListener('pointerleave', () => { isDragging.current = false })
            } else {
                setTimeout(tryAttach, 50)
            }
        }
        tryAttach()

        return () => {
            if (canvas) {
                canvas.removeEventListener('wheel', onWheel)
                canvas.removeEventListener('pointerdown', onPointerDown)
                canvas.removeEventListener('pointermove', onPointerMove)
                canvas.removeEventListener('pointerup', onPointerUp)
            }
        }
    }, [])

    return { targetOffset, targetScale, isDragging, curScaleRef, curOffsetRef }
}
