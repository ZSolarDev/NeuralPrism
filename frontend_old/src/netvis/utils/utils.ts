export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const scaleNeuronsCount = (counts: number[], minSize = 1, maxSize = 15) => {
    const minCount = Math.min(...counts)
    const maxCount = Math.max(...counts)
    if (minCount === maxCount) return counts.map(() => maxSize)
    return counts.map(n =>
        minSize + (n - minCount) * (maxSize - minSize) / (maxCount - minCount)
    ).map(Math.round)
}

export type Neuron = { x: number; y: number; realIndex: number }
export type Layer = Neuron[]
