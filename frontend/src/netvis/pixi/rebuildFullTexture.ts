import { RenderTexture, Sprite, Graphics, Matrix, Container } from 'pixi.js'
import { lerp, Layer } from '../utils/utils'

export function rebuildFullTexture(
    app: any,
    layers: Layer[],
    highestLayer: number,
    textureRef: React.MutableRefObject<RenderTexture | null>,
    spriteRef: React.MutableRefObject<Sprite | null>,
    containerRef: React.MutableRefObject<Container | null>,
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

    textureRef.current?.destroy(true)
    textureRef.current = RenderTexture.create({ width: texW, height: texH })

    const g = new Graphics()
    layers.slice(0, -1).forEach((layer, i) => {
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
