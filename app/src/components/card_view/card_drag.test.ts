import { describe, expect, it } from 'vitest'
import type { DragMoveEvent } from '@dnd-kit/core'
import { columnDropId, getCardDropPlacement, getCardTypeColor, resolveCardDragEvent, resolveDrop } from './card_drag'
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
        expect(resolveDrop(columns, 'a', 'a', 'before')).toBeNull()
    })

    it('inserts before the card it is dropped over in the destination column', () => {
        expect(resolveDrop(columns, 'c', 'a', 'before')).toEqual({ targetIndex: 0, targetStatus: 'todo' })
    })

    it('inserts after the card it is dropped over in the destination column', () => {
        expect(resolveDrop(columns, 'a', 'p', 'after')).toEqual({ targetIndex: 1, targetStatus: 'done' })
    })

    it('appends after the final card in a destination column with two cards', () => {
        expect(resolveDrop(columns, 'a', 'q', 'after')).toEqual({ targetIndex: 2, targetStatus: 'done' })
    })

    it('appends to the end when dropped on a column container', () => {
        expect(resolveDrop(columns, 'a', columnDropId('done'), 'before')).toEqual({ targetIndex: 2, targetStatus: 'done' })
    })

    it('targets the destination column when dropped over a card in another column', () => {
        expect(resolveDrop(columns, 'a', 'p', 'before')).toEqual({ targetIndex: 0, targetStatus: 'done' })
    })
})

describe('getCardDropPlacement', () => {
    it('places the drop before a card when the pointer is in its top half', () => {
        expect(getCardDropPlacement(124, 100, 50)).toBe('before')
    })

    it('places the drop after a card when the pointer is in its bottom half', () => {
        expect(getCardDropPlacement(126, 100, 50)).toBe('after')
    })
})

describe('resolveCardDragEvent', () => {
    it('uses current collision bounds when target card has no drag-start measurement', () => {
        const event = {
            active: { id: 'a' },
            activatorEvent: { clientY: 100 },
            delta: { x: 0, y: 31 },
            over: { id: 'p', rect: { height: 60, top: 100 } },
        } as unknown as DragMoveEvent

        expect(resolveCardDragEvent(columns, event, new Map())).toEqual({ targetIndex: 1, targetStatus: 'done' })
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
