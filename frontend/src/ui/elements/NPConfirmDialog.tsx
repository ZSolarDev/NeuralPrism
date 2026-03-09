import NPWindow from "./NPWindow"
import NPButton from "./NPButton"

function NPConfirmDialog({ message, onConfirm, onCancel }: {
    message:string
    onConfirm:() => void
    onCancel:() => void
}) {
    return (
        <NPWindow
            name="Confirm"
            onClose={onCancel}
            defaultSize={{ width: 300, height: 150 }}
            bounds={() => ({ x: 0, y: 35, w: window.innerWidth, h: window.innerHeight - 35 })}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <span style={{ color: "#D0D0D0", fontSize: "0.85rem" }}>{message}</span>
                <div style={{ display: "flex", gap: "8px" }}>
                    <NPButton onClick={onConfirm} style={{ flex: 1 }}>Yes</NPButton>
                    <NPButton onClick={onCancel} style={{ flex: 1 }}>No</NPButton>
                </div>
            </div>
        </NPWindow>
    )
}

export default NPConfirmDialog