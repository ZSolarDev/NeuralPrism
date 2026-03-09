import { RenderTexture, Sprite, Graphics, Matrix, Container } from 'pixi.js'
import { lerp, Layer } from '../utils/utils'

export function rebuildZoomedTexture(
    app: any,
    layers: Layer[],
    nActivations: number[][],
    globalMax: number,
    layerMaxes: number[],
    rawMode: boolean,
    scale: number,
    offset: { x: number; y: number },
    screenW: number,
    screenH: number,
    textureRef: React.MutableRefObject<RenderTexture | null>,
    spriteRef: React.MutableRefObject<Sprite | null>,
    containerRef: React.MutableRefObject<Container | null>,
) {
    if (!app || layers.flat().length === 0) return

    const resolution = scale > 3
        ? Math.min(8, (window.devicePixelRatio || 1) * 4)
        : Math.min(4, (window.devicePixelRatio || 1) * 2)

    const paddedW = screenW * 1.5
    const paddedH = screenH * 1.5

    const texW = Math.floor(paddedW * resolution)
    const texH = Math.floor(paddedH * resolution)

    const worldLeft   = (-offset.x - paddedW / 2) / scale
    const worldTop    = (-offset.y - paddedH / 2) / scale
    const worldRight  = (-offset.x + paddedW / 2) / scale
    const worldBottom = (-offset.y + paddedH / 2) / scale

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
        if (layer[0].x > worldRight + 200 || layer[0].x < worldLeft - 200) return
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
    matrix.scale(scale * resolution, scale * resolution)
    matrix.translate(-worldLeft * scale * resolution, -worldTop * scale * resolution)
    app.renderer.render({ container: g, target: textureRef.current, clear: true, transform: matrix })
    g.destroy()

    const spriteScale = 1 / (scale * resolution)

    if (!spriteRef.current) {
        const sprite = new Sprite(textureRef.current)
        sprite.anchor.set(0, 0)
        sprite.scale.set(spriteScale)
        sprite.position.set(worldLeft, worldTop)
        spriteRef.current = sprite
        containerRef.current?.addChildAt(sprite, 0)
    } else {
        spriteRef.current.texture = textureRef.current
        spriteRef.current.scale.set(spriteScale)
        spriteRef.current.position.set(worldLeft, worldTop)
    }

    return { left: worldLeft, top: worldTop, right: worldRight, bottom: worldBottom }
}