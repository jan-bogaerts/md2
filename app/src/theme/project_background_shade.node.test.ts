import { describe, expect, it } from 'vitest'
import { createRandomProjectBackgroundShade, RANDOM_PROJECT_BACKGROUND_SHADES } from './project_background_shade'

describe('createRandomProjectBackgroundShade', () => {
    it('selects across all visible project shades', () => {
        expect(createRandomProjectBackgroundShade(() => 0)).toBe(RANDOM_PROJECT_BACKGROUND_SHADES[0])
        expect(createRandomProjectBackgroundShade(() => 0.999999)).toBe(RANDOM_PROJECT_BACKGROUND_SHADES.at(-1))
    })

    it('never includes the neutral shade', () => {
        const selectedShades = RANDOM_PROJECT_BACKGROUND_SHADES.map((_, index) => (
            createRandomProjectBackgroundShade(() => index / RANDOM_PROJECT_BACKGROUND_SHADES.length)
        ))

        expect(selectedShades).not.toContain('neutral')
    })

    it('rejects values outside the Math.random range', () => {
        expect(() => createRandomProjectBackgroundShade(() => 1)).toThrow('Random value must be between 0 and 1')
    })
})
