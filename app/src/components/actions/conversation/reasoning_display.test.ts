import { describe, expect, it } from 'vitest'
import { reasoningDisplay } from './reasoning_display'

describe('reasoningDisplay', () => {
    it('selects summary sections in order before details and content', () => {
        expect(reasoningDisplay({
            content: 'content',
            details: ['detail'],
            summary: ['first summary', 'second summary'],
        })).toEqual({ hasText: true, sections: ['first summary', 'second summary'] })
    })

    it('selects details when summary is empty', () => {
        expect(reasoningDisplay({ content: 'content', details: ['first detail', 'second detail'], summary: [] }))
            .toEqual({ hasText: true, sections: ['first detail', 'second detail'] })
    })

    it('selects content when section arrays are empty', () => {
        expect(reasoningDisplay({ content: 'content', details: [], summary: [] }))
            .toEqual({ hasText: true, sections: ['content'] })
    })

    it.each([
        ['missing fields', {}],
        ['empty arrays', { content: '', details: [], summary: [] }],
        ['empty summary string', { content: 'ignored content', summary: [''] }],
        ['whitespace summary', { details: ['ignored detail'], summary: ['  ', '\n\t'] }],
        ['whitespace details', { content: 'ignored content', details: ['  '] }],
        ['whitespace content', { content: ' \n\t' }],
    ])('reports no displayable text for %s', (_label, source) => {
        expect(reasoningDisplay(source).hasText).toBe(false)
    })
})
