import { describe, expect, it } from 'vitest'
import type { DragMoveEvent } from '@dnd-kit/core'
import { columnDropId, getCardTypeColor, resolveCardDragEvent, resolveDrop } from './card_drag'
import type { CardColumn } from '../../data/card_ordering'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'

function card(path: string, internalId: string): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
        content: '',
        header: { affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId, owner: null, policy: {}, status: 'todo', title: path },
        isActive: true,
        path,
    }
}

const columns: CardColumn[] = [
    { cards: [card('a', 'a'), card('b', 'b'), card('c', 'c')], status: 'todo' },
    { cards: [card('p', 'p'), card('q', 'q')], status: 'done' },
]

describe('resolveDrop', () => {
    it('returns null when dropped on itself', () => {
        expect(resolveDrop(columns, 'a', 'a')).toBeNull()
    })

    it('inserts at the position of the card it is dropped on', () => {
        expect(resolveDrop(columns, 'c', 'a')).toEqual({ targetIndex: 0, targetStatus: 'todo' })
    })

    it('moves one position up when dropped on the preceding card', () => {
        expect(resolveDrop(columns, 'c', 'b')).toEqual({ targetIndex: 1, targetStatus: 'todo' })
    })

    it('moves one position down when dropped on the following card', () => {
        expect(resolveDrop(columns, 'b', 'c')).toEqual({ targetIndex: 2, targetStatus: 'todo' })
    })

    it('inserts at the hovered position in another column', () => {
        expect(resolveDrop(columns, 'a', 'q')).toEqual({ targetIndex: 1, targetStatus: 'done' })
    })

    it('appends to the end when dropped on the column end target', () => {
        expect(resolveDrop(columns, 'a', columnDropId('done'))).toEqual({ targetIndex: 2, targetStatus: 'done' })
    })

    it('targets the destination column when dropped over a card in another column', () => {
        expect(resolveDrop(columns, 'a', 'p')).toEqual({ targetIndex: 0, targetStatus: 'done' })
    })
})

describe('resolveCardDragEvent', () => {
    it('inserts at the hovered card without pointer-position calculations', () => {
        const event = {
            active: { id: 'a' },
            over: { id: 'p', rect: { height: 60, top: 100 } },
        } as unknown as DragMoveEvent

        expect(resolveCardDragEvent(columns, event)).toEqual({ targetIndex: 0, targetStatus: 'done' })
    })
})

describe('getCardTypeColor', () => {
    const cardTypes: CardTypeConfig[] = [
        { color: '#111', idPrefix: 'F', label: 'Feature', type: 'feature' },
        { color: '#222', idPrefix: 'B', label: 'Bug', type: 'bug' },
    ]

    it('resolves the color from the id prefix', () => {
        expect(getCardTypeColor(cardTypes, 'F-005')).toBe('#111')
        expect(getCardTypeColor(cardTypes, 'F_005')).toBe('#111')
        expect(getCardTypeColor(cardTypes, 'B-3')).toBe('#222')
    })

    it('returns undefined for an unknown prefix', () => {
        expect(getCardTypeColor(cardTypes, 'X-1')).toBeUndefined()
    })
})
