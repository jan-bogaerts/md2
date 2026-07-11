export const PROJECT_BACKGROUND_SHADES = ['neutral', 'blue', 'green', 'red', 'purple', 'amber'] as const
export const RANDOM_PROJECT_BACKGROUND_SHADES = PROJECT_BACKGROUND_SHADES.filter((shade) => shade !== 'neutral')

export type ProjectBackgroundShade = typeof PROJECT_BACKGROUND_SHADES[number]

/** Choose a visible background shade for a newly configured project. */
export function createRandomProjectBackgroundShade(random = Math.random): ProjectBackgroundShade {
    const randomValue = random()
    if (randomValue < 0 || randomValue >= 1) throw new Error(`Random value must be between 0 and 1: ${randomValue}`)

    return RANDOM_PROJECT_BACKGROUND_SHADES[Math.floor(randomValue * RANDOM_PROJECT_BACKGROUND_SHADES.length)]
}
