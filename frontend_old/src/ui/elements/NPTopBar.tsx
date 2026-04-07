import { useEffect, useRef } from "react"

export const topBarHeightRef = { current: 35 }

function NPTopBar({ children }:{ children?: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new ResizeObserver(entries => {
            topBarHeightRef.current = entries[0].contentRect.height + 13
            window.dispatchEvent(new Event('topbarresize'))
        })
        observer.observe(el)
        topBarHeightRef.current = el.getBoundingClientRect().height
        return () => observer.disconnect()
    }, [])

    return (
        <div ref={ref} style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            minHeight: "35px",
            background: "#2C2C2C",
            borderBottom: "1px solid #7C7C7C",
            display: "flex",
            alignItems: "center",
            padding: "6px 12px",
            gap: "10px",
            zIndex: 20,
            userSelect: "none",
            fontFamily: "monospace",
            color: "#FFFFFF",
            boxSizing: "border-box",
        }}>
            {children}
        </div>
    )
}

export default NPTopBar