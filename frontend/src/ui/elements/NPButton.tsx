import { useState } from "react";

function NPButton({ children, onClick, disabled, style }: { children:React.ReactNode, onClick?:() => void, disabled?:boolean, style?:React.CSSProperties }) {
    const [hovered, setHovered] = useState(false)
    const [pressed, setPressed] = useState(false)

    const active = hovered && !disabled

    return (
        <button
            onClick={disabled ? undefined : onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setPressed(false) }}
            onMouseDown={() => { if (!disabled) setPressed(true) }}
            onMouseUp={() => setPressed(false)}
            style={{
                background: disabled ? "#1a1a1a" : active ? "#222222" : "#252525",
                color: disabled ? "#555555" : active ? "#FFFFFF" : "#DDDDDD",
                border: disabled ? "1px solid #1f1f1f" : active ? "1px solid #7C7C7C" : "1px solid #2C2C2C",
                fontFamily: "monospace",
                cursor: disabled ? "not-allowed" : "pointer",
                padding: "4px 8px",
                borderRadius: "4px",
                transform: pressed && !disabled ? "scale(0.95)" : "scale(1)",
                transition: "transform 0.1s ease, background 0.15s ease, color 0.15s ease, border 0.15s ease",
                minHeight: "31px",
                ...style
            }}
        >
            {children}
        </button>
    )
}

export default NPButton