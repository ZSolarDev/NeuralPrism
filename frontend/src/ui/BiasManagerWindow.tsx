import NPWindow from "./elements/NPWindow"
import NPButton from "./elements/NPButton"
import NPEditableList from "./elements/NPEditableList"
import { Client, FeatureBias } from "../api/client"
import { Input } from "@/components/ui/input"
import ConditionEditor from "./ConditionEditor"

function BiasManagerWindow({ onClose, biases, onChange }: {
    onClose:() => void
    biases:FeatureBias[]
    onChange:(biases:FeatureBias[]) => void
}) {
    return (
        <NPWindow
            name="Bias Manager"
            onClose={onClose}
            defaultSize={{ width: 400, height: 385 }}
            fitToBounds={true}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <NPEditableList
                    label="Biases"
                    items={biases}
                    onChange={onChange}
                    showAdd={false}
                    confirmRemove={(item) => `Delete "${item.name}"? This cannot be undone.`}
                    renderItem={(item, i, update) => (
                        <div 
                            style={{
                                border: "1px solid #7C7C7C",
                                borderRadius: "8px",
                                padding: "8px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                flex: 1
                            }}
                        >
                            <div style={{ display: "flex", gap: "6px" }}>
                                <Input
                                    value={item.name}
                                    placeholder="Name"
                                    onChange={e => {
                                        const isDuplicate = biases.some((b, j) => j !== i && b.name === e.target.value)
                                        if (!isDuplicate) update({ ...item, name: e.target.value })
                                    }}
                                    style={{
                                        border: "1px solid #7C7C7C",
                                        padding: "4px 8px",
                                        fontSize: "0.85rem",
                                        backgroundColor: "#252525",
                                        height: "31px",
                                        flex: 2
                                    }}
                                    className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                                />
                                <Input
                                    value={item.bias}
                                    placeholder="Bias"
                                    type="number"
                                    step={0.1}
                                    onChange={e => update({ ...item, bias: parseFloat(e.target.value) || 0 })}
                                    style={{
                                        border: "1px solid #7C7C7C",
                                        padding: "4px 8px",
                                        fontSize: "0.85rem",
                                        backgroundColor: "#252525",
                                        height: "31px",
                                        flex: 1
                                    }}
                                    className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white"
                                />
                            </div>
                            <ConditionEditor item={item} i={i} biases={biases} update={update} />
                        </div>
                    )}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                    <NPButton onClick={() => {
                        const input = document.createElement("input")
                        input.type = "file"
                        input.accept = ".npbp"
                        input.onchange = async () => {
                            if (!input.files?.[0]) return
                            const loaded = await Client.loadProfile(input.files[0])
                            onChange(loaded)
                        }
                        input.click()
                    }} style={{ flex: 1 }}>Load Profile</NPButton>
                    <NPButton onClick={() => Client.saveProfile(biases)} style={{ flex: 1 }}>Save Profile</NPButton>
                </div>
            </div>
        </NPWindow>
    )
}

export default BiasManagerWindow