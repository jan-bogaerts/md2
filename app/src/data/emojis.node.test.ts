import { describe, expect, it } from 'vitest'
import { EMOJI_GROUPS, EMOJIS } from './emojis'

describe('emoji catalogue', () => {
    it('contains a common emoji set with unique characters', () => {
        const duplicates = EMOJIS.map(({ char }) => char).filter((char, index, chars) => chars.indexOf(char) !== index)

        expect(duplicates).toEqual([])
        expect(EMOJIS.length).toBeGreaterThanOrEqual(1000)
    })

    it('gives every emoji a name, non-empty keywords and a known group', () => {
        const groupIds = new Set(EMOJI_GROUPS.map(({ id }) => id))

        for (const emoji of EMOJIS) {
            expect(emoji.char, emoji.name).not.toBe('')
            expect(emoji.name, emoji.char).not.toBe('')
            expect(emoji.keywords.length, emoji.name).toBeGreaterThan(0)
            expect(emoji.keywords.every((keyword) => keyword.length > 0), emoji.name).toBe(true)
            expect(groupIds.has(emoji.group), emoji.name).toBe(true)
        }
    })

    it('has at least one emoji in every group', () => {
        for (const group of EMOJI_GROUPS) {
            expect(EMOJIS.some((emoji) => emoji.group === group.id), group.id).toBe(true)
        }
    })

    it('builds country flags from their regional indicator letters', () => {
        expect(EMOJIS.find(({ name }) => name === 'flag Belgium')?.char).toBe('🇧🇪')
    })
})
