// the amount of pain I had to go through to get this to work..
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Application, ApplicationRef } from '@pixi/react'
import { RenderTexture, Container, Sprite, Graphics } from 'pixi.js'
import { extend } from '@pixi/react'
import { lerp, scaleNeuronsCount, Layer } from '../utils/utils'
import { rebuildFullTexture } from '../pixi/rebuildFullTexture'
import { rebuildZoomedTexture } from '../pixi/rebuildZoomedTexture'
import { useCanvasControls } from '../hooks/useCanvasControls'

extend({ Container, Graphics, RenderTexture, Sprite })

function NetworkVisualizer({
    numLayers,
    nPerLayer,
    nActivations,
    highestLayer,
    rawMode = false,
}: {
    numLayers:number
    nPerLayer:number[]
    nActivations:number[][]
    highestLayer:number
    rawMode?:boolean
}) {
    const appRef = useRef<ApplicationRef | null>(null)
    const containerRef = useRef<Container | null>(null)

    const fullSpriteRef = useRef<Sprite | null>(null)
    const fullTextureRef = useRef<RenderTexture | null>(null)

    const zoomedSpriteRef = useRef<Sprite | null>(null)
    const zoomedTextureRef = useRef<RenderTexture | null>(null)
    const zoomedDirtyRef = useRef(true)
    const isZoomedInRef = useRef(false)
    const isHighZoomedInRef = useRef(false)
    const lastBuiltBounds = useRef({ left: 0, top: 0, right: 0, bottom: 0 })

    const pulseRef = useRef(0)
    const pulseGfxRef = useRef<any>(null)
    const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })

    const { targetOffset, targetScale, isDragging, curScaleRef, curOffsetRef } = useCanvasControls(
        () => appRef.current?.getApplication?.()?.canvas as HTMLCanvasElement | null
    )

    const { globalMax, layerMaxes } = useMemo(() => {
        const flat = nActivations.flat()
        const globalMax = Math.max(...flat.map(Math.abs), 1e-6)
        const layerMaxes = nActivations.map(layer =>
            Math.max(...layer.map(Math.abs), 1e-6)
        )
        return { globalMax, layerMaxes }
    }, [nActivations])

    const getActivationProcessed = (li:number, realIndex:number) => {
        const layerActs = nActivations?.[li] ?? []
        const layerMax = layerMaxes[li] ?? 1e-6
        const layerImportance = Math.pow(layerMax / globalMax, 1.5)
        const raw = layerActs[realIndex] ?? 0
        const localActivation = Math.pow(Math.abs(raw) / layerMax, 1.5)
        return localActivation * layerImportance
    }

    const getActivationRaw = (li:number, realIndex:number) => {
        const layerActs = nActivations?.[li] ?? []
        const raw = layerActs[realIndex] ?? 0
        return Math.abs(raw) / globalMax
    }

    const getActivation = rawMode ? getActivationRaw : getActivationProcessed

    useEffect(() => {
        const trySetInitial = () => {
            if (!containerRef.current) {
                requestAnimationFrame(trySetInitial)
                return
            }
            containerRef.current.scale.set(curScaleRef.current)
            containerRef.current.position.set(
                curOffsetRef.current.x + size.width / 2,
                curOffsetRef.current.y + size.height / 2
            )
        }
        trySetInitial()
    }, [])

    useEffect(() => {
        const handleResize = () => {
            setSize({ width: window.innerWidth, height: window.innerHeight })
            const app = appRef.current?.getApplication?.()
            if (app) app.renderer.resize(window.innerWidth, window.innerHeight)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const layerSpacing = 150
    const neuronSpacing = 30
    const neuronRadius = 8

    const layers:Layer[] = useMemo(() => {
        const scaled = scaleNeuronsCount(nPerLayer, 1, 15)
        return scaled.map((count, li) => {
            const totalNeurons = nPerLayer[li]
            const totalHeight = (count - 1) * neuronSpacing
            const x = li * layerSpacing - (numLayers - 1) * layerSpacing / 2

            let selectedIndices:number[]
            if (totalNeurons <= count) {
                selectedIndices = Array.from({ length: totalNeurons }, (_, i) => i)
            } else {
                const layerActs = nActivations?.[li]
                if (layerActs?.length) {
                    selectedIndices = Array.from({ length: totalNeurons }, (_, i) => i)
                        .sort((a, b) => Math.pow(Math.abs(layerActs[b]), 8) - Math.pow(Math.abs(layerActs[a]), 8))
                        .slice(0, count)
                        .sort((a, b) => a - b)
                } else {
                    selectedIndices = Array.from({ length: count }, (_, ni) =>
                        Math.floor(ni / Math.max(count - 1, 1) * (totalNeurons - 1))
                    )
                }
            }

            return selectedIndices.map((realIndex, ni) => ({
                x,
                y: ni * neuronSpacing - totalHeight / 2,
                realIndex,
            }))
        })
    }, [nPerLayer, numLayers, nActivations])

    // rebuild full texture when layers change
    useEffect(() => {
        const tryBuild = () => {
            const app = appRef.current?.getApplication?.()
            if (!app || !app.renderer) {
                requestAnimationFrame(tryBuild)
                return
            }
            rebuildFullTexture(app, layers, nActivations, globalMax, layerMaxes, rawMode, fullTextureRef, fullSpriteRef, containerRef)
            zoomedDirtyRef.current = true
        }
        tryBuild()
    }, [layers, highestLayer, rawMode])

    // animate loop
    useEffect(() => {
        let animFrame:number
        const { width, height } = size

        const animate = () => {
            const lerpFactor = isDragging.current ? 1.0 : 0.1

            curScaleRef.current = lerp(curScaleRef.current, targetScale.current, 0.1)
            curOffsetRef.current = {
                x: lerp(curOffsetRef.current.x, targetOffset.current.x, lerpFactor),
                y: lerp(curOffsetRef.current.y, targetOffset.current.y, lerpFactor),
            }

            if (containerRef.current) {
                containerRef.current.scale.set(curScaleRef.current)
                containerRef.current.position.set(
                    curOffsetRef.current.x + width / 2,
                    curOffsetRef.current.y + height / 2
                )
            }

            const enteringZoom = curScaleRef.current >= 1.5
            const enteringHighZoom = curScaleRef.current >= 3

            if (enteringHighZoom && !isHighZoomedInRef.current) {
                isHighZoomedInRef.current = true
                zoomedDirtyRef.current = true
            } else if (!enteringHighZoom && isHighZoomedInRef.current) {
                isHighZoomedInRef.current = false
                zoomedDirtyRef.current = true
            }

            // fade between full and zoomed sprites
            const zoomT = Math.max(0, Math.min(1, (curScaleRef.current - 1.5) / (2 - 1.5)))
            if (fullSpriteRef.current) {
                fullSpriteRef.current.alpha = 1 - zoomT
                fullSpriteRef.current.visible = fullSpriteRef.current.alpha > 0.01
            }
            if (zoomedSpriteRef.current) {
                zoomedSpriteRef.current.alpha = zoomT
                zoomedSpriteRef.current.visible = zoomedSpriteRef.current.alpha > 0.01
            }

            if (enteringZoom) {
                const b = lastBuiltBounds.current
                const curLeft   = (-curOffsetRef.current.x - width / 2) / curScaleRef.current
                const curTop    = (-curOffsetRef.current.y - height / 2) / curScaleRef.current
                const curRight  = (-curOffsetRef.current.x + width / 2) / curScaleRef.current
                const curBottom = (-curOffsetRef.current.y + height / 2) / curScaleRef.current

                if (curLeft < b.left || curTop < b.top || curRight > b.right || curBottom > b.bottom) {
                    zoomedDirtyRef.current = true
                }
            }

            // rebuild zoomed sprite once when dirty
            if (enteringZoom && zoomedDirtyRef.current) {
                zoomedDirtyRef.current = false
                const app = appRef.current?.getApplication?.()
                if (app) {
                    const bounds = rebuildZoomedTexture(
                        app, layers, nActivations, globalMax, layerMaxes, rawMode,
                        curScaleRef.current, curOffsetRef.current,
                        width, height,
                        zoomedTextureRef, zoomedSpriteRef, containerRef
                    )
                    if (bounds)
                        lastBuiltBounds.current = bounds
                }
            }

            // pulse
            const hasActivation = layers.some((layer, li) =>
                layer.some(n => getActivation(li, n.realIndex) >= 0.5)
            )
            const activationCache = layers.map((layer, li) =>
                layer.map(n => getActivation(li, n.realIndex))
            )
            if (hasActivation) {
                pulseRef.current = (pulseRef.current + 0.02) % 1
                const g = pulseGfxRef.current
                if (g) {
                    g.clear()
                    layers.forEach((layer, li) =>
                        layer.forEach((neuron, ni) => {
                            const activation = activationCache[li][ni]
                            if (activation < 0.5) return
                            const intensity = (activation - 0.5) / 0.5
                            const baseRadius = neuronRadius + activation * neuronRadius * 0.5
                            const pulseRadius = baseRadius + pulseRef.current * 20 * intensity
                            const alpha = intensity * (1 - pulseRef.current) * 0.8
                            g.setStrokeStyle({ width: 1.5, color: 0x00ff41, alpha })
                            g.circle(neuron.x, neuron.y, pulseRadius)
                            g.stroke()
                        })
                    )
                }
            } else if (pulseGfxRef.current) {
                pulseGfxRef.current.clear()
            }

            animFrame = requestAnimationFrame(animate)
        }
        animFrame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(animFrame)
    }, [layers, nActivations, size, rawMode])

    const drawNeurons = useCallback((g:any) => {
        g.clear()
        layers.forEach((layer, li) =>
            layer.forEach((neuron) => {
                const activation = getActivation(li, neuron.realIndex)
                const brightness = Math.max(0, Math.min(255, Math.floor(activation * 255)))
                const color = brightness * 0x000100
                const radius = neuronRadius + activation * neuronRadius * 0.5
                g.setStrokeStyle({ width: 1.5, color: 0x00ff41, alpha: 1 })
                g.circle(neuron.x, neuron.y, radius)
                g.fill({ color })
                g.stroke()
            })
        )
    }, [layers, nActivations, rawMode])

    const { width, height } = size

    return (
        <Application
            width={width}
            height={height}
            antialias={true}
            backgroundColor={0x141a16}
            ref={appRef}
        >
            <pixiContainer
                x={width / 2}
                y={height / 2}
                ref={containerRef}
            >
                <pixiGraphics key={layers.flat().length} draw={drawNeurons} />
                <pixiGraphics ref={pulseGfxRef} draw={() => {}} />
            </pixiContainer>
        </Application>
    )
}

export default NetworkVisualizer