function NPTopBar({ children }: { children?: React.ReactNode }) {
    return (
        <div style={{
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