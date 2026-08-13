import { describe, expect, it } from 'vitest'
import { contextWindowUsedPercent } from './conversation_context_window'

describe('contextWindowUsedPercent', () => {
    it('rounds occupancy and caps values above capacity', () => {
        expect(contextWindowUsedPercent({ capacityTokens: 258_400, usedTokens: 42_000 })).toBe(16)
        expect(contextWindowUsedPercent({ capacityTokens: 100, usedTokens: 125 })).toBe(100)
    })

    it.each([
        undefined,
        null,
        { capacityTokens: 0, usedTokens: 1 },
        { capacityTokens: -1, usedTokens: 1 },
        { capacityTokens: '100', usedTokens: 1 },
        { capacityTokens: 100, usedTokens: -1 },
        { capacityTokens: 100, usedTokens: Number.NaN },
    ])('returns null for unavailable or malformed snapshot %#', (snapshot) => {
        expect(contextWindowUsedPercent(snapshot)).toBeNull()
    })
})
