import { RenderTexture, Sprite, Graphics, Matrix, Container } from 'pixi.js'
import { lerp, Layer } from '../utils/utils'

export function rebuildZoomedTexture(
    app: any,
    layers: Layer[],
    highestLayer: number,
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
    ? Math.min(8, (window.devicePixelRatio || 1) * 4)  // max quality
    : Math.min(4, (window.devicePixelRatio || 1) * 2)  // medium quality

    const paddedW = screenW * 1.5
    const paddedH = screenH * 1.5

    const texW = Math.floor(paddedW * resolution)
    const texH = Math.floor(paddedH * resolution)

    const worldLeft  = (-offset.x - paddedW / 2) / scale
    const worldTop   = (-offset.y - paddedH / 2) / scale
    const worldRight = (-offset.x + paddedW / 2) / scale
    const worldBottom = (-offset.y + paddedH / 2) / scale

    textureRef.current?.destroy(true)
    textureRef.current = RenderTexture.create({ width: texW, height: texH })

    const g = new Graphics()
    layers.slice(0, -1).forEach((layer, i) => {
        if (layer[0].x > worldRight + 200 || layer[0].x < worldLeft - 200) return
        const t = highestLayer === 0 ? 1 : Math.min(i, highestLayer) / highestLayer
        const alpha = lerp(0.03, 0.2, t)
        g.setStrokeStyle({ width: 1, color: 0x00ff41, alpha })
        layer.forEach(n =>
            layers[i + 1].forEach(n2 => {
                const cpX = (n.x + n2.x) / 2
                g.moveTo(n.x, n.y)
                g.bezierCurveTo(cpX, n.y, cpX, n2.y, n2.x, n2.y)
            })
        )
        g.stroke()
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
