import { RenderTexture, Sprite, Graphics, Matrix, Container } from 'pixi.js'
import { lerp, Layer } from '../utils/utils'

export function rebuildFullTexture(
    app:any,
    layers:Layer[],
    nActivations:number[][],
    globalMax:number,
    layerMaxes:number[],
    rawMode:boolean,
    textureRef:React.MutableRefObject<RenderTexture | null>,
    spriteRef:React.MutableRefObject<Sprite | null>,
    containerRef:React.MutableRefObject<Container | null>,
) {
    if (!app || layers.flat().length === 0) return

    const allX = layers.flat().map(n => n.x)
    const allY = layers.flat().map(n => n.y)
    const minX = Math.min(...allX)
    const maxX = Math.max(...allX)
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const padding = 50
    const worldWidth = maxX - minX + padding * 2
    const worldHeight = maxY - minY + padding * 2
    const resolution = window.devicePixelRatio || 1

    const maxTextureSize = (app.renderer as any).gl.getParameter((app.renderer as any).gl.MAX_TEXTURE_SIZE)
    const rawW = worldWidth * resolution
    const rawH = worldHeight * resolution
    const texScale = Math.min(1, maxTextureSize / Math.max(rawW, rawH))
    const texW = Math.floor(rawW * texScale)
    const texH = Math.floor(rawH * texScale)
    const effRes = resolution * texScale

    const neuronActs = layers.map((layer, li) => {
        const acts = nActivations?.[li]
        const layerMax = layerMaxes[li] ?? 1e-6
        return layer.map(n => {
            if (!acts?.length) return -1
            const raw = Math.abs(acts[n.realIndex] ?? 0)
            if (rawMode) {
                return raw / globalMax
            } else {
                const layerImportance = Math.pow(layerMax / globalMax, 1.5)
                const localActivation = Math.pow(raw / layerMax, 1.5)
                return localActivation * layerImportance
            }
        })
    })

    textureRef.current?.destroy(true)
    textureRef.current = RenderTexture.create({ width: texW, height: texH })

    const g = new Graphics()
    layers.slice(0, -1).forEach((layer, li) => {
        layer.forEach((n, ni) => {
            layers[li + 1].forEach((n2, ni2) => {
                const a1 = neuronActs[li][ni]
                const a2 = neuronActs[li + 1][ni2]
                const noData = a1 === -1 || a2 === -1
                
                const segments = 8
                for (let s = 0; s < segments; s++) {
                    const t0 = s / segments
                    const t1 = (s + 1) / segments
                    const alpha = noData ? 0.1 : lerp(0.03, 0.6, Math.pow(lerp(a1, a2, (t0 + t1) / 2), 2))
                    const x0 = lerp(n.x, n2.x, t0)
                    const y0 = lerp(n.y, n2.y, t0)
                    const x1 = lerp(n.x, n2.x, t1)
                    const y1 = lerp(n.y, n2.y, t1)
                    g.setStrokeStyle({ width: 1, color: 0x00ff41, alpha })
                    g.moveTo(x0, y0)
                    g.lineTo(x1, y1)
                    g.stroke()
                }
            })
        })
    })

    const matrix = new Matrix()
    matrix.scale(effRes, effRes)
    matrix.translate((-minX + padding) * effRes, (-minY + padding) * effRes)
    app.renderer.render({ container: g, target: textureRef.current, clear: true, transform: matrix })
    g.destroy()

    if (!spriteRef.current) {
        const sprite = new Sprite(textureRef.current)
        sprite.anchor.set(0, 0)
        sprite.scale.set(1 / effRes)
        sprite.position.set(minX - padding, minY - padding)
        spriteRef.current = sprite
        containerRef.current?.addChildAt(sprite, 0)
    } else {
        spriteRef.current.texture = textureRef.current
        spriteRef.current.scale.set(1 / effRes)
        spriteRef.current.position.set(minX - padding, minY - padding)
    }
}