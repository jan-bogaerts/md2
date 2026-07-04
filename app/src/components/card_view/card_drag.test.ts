import { describe, expect, it } from 'vitest'
import { columnDropId, getCardTypeColor, resolveDrop } from './card_drag'
import type { CardColumn } from '../../data/card_ordering'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'

function card(path: string, internalId: string): ProjectCard {
    return {
        content: '',
        header: { affects: [], after: null, id: path, internalId, owner: null, policy: {}, status: 'todo', title: path },
        isActive: true,
        path,
    }
}

const columns: CardColumn[] = [
    { cards: [card('a', 'a'), card('b', 'b'), card('c', 'c')], status: 'todo' },
    { cards: [card('p', 'p')], status: 'done' },
]

describe('resolveDrop', () => {
    it('returns null when dropped on itself', () => {
        expect(resolveDrop(columns, 'a', 'a')).toBeNull()
    })

    it('inserts before the card it is dropped over in the destination column', () => {
        expect(resolveDrop(columns, 'c', 'a')).toEqual({ targetIndex: 0, targetStatus: 'todo' })
    })

    it('appends to the end when dropped on a column container', () => {
        expect(resolveDrop(columns, 'a', columnDropId('done'))).toEqual({ targetIndex: 1, targetStatus: 'done' })
    })

    it('targets the destination column when dropped over a card in another column', () => {
        expect(resolveDrop(columns, 'a', 'p')).toEqual({ targetIndex: 0, targetStatus: 'done' })
    })
})

describe('getCardTypeColor', () => {
    const cardTypes: CardTypeConfig[] = [
        { color: '#111', idPrefix: 'F', label: 'Feature', type: 'feature' },
        { color: '#222', idPrefix: 'B', label: 'Bug', type: 'bug' },
    ]

    it('resolves the color from the id prefix', () => {
        expect(getCardTypeColor(cardTypes, 'F-005')).toBe('#111')
        expect(getCardTypeColor(cardTypes, 'B-3')).toBe('#222')
    })

    it('returns undefined for an unknown prefix', () => {
        expect(getCardTypeColor(cardTypes, 'X-1')).toBeUndefined()
    })
})
