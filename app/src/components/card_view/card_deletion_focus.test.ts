import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardColumn } from '../../data/card_ordering'
import type { Card } from '../../data/data_types'
import { focusCardDeletionTarget, resolveCardDeletionFocusTarget } from './card_deletion_focus'

function card(internalId: string): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [],
            after: null,
            agentLogReferences: [],
            changedFiles: [],
            author: null,
            id: internalId.toUpperCase(),
            internalId,
            owner: null,
            policy: {},
            references: [],
            status: 'active',
            title: internalId,
        },
        hasFrontmatter: true,
        isActive: true,
        path: `design/${internalId}.md`,
    }
}

const columns: CardColumn[] = [
    { cards: [card('a'), card('b'), card('c')], status: 'active' },
    { cards: [card('d')], status: 'done' },
]

describe('resolveCardDeletionFocusTarget', () => {
    it('targets the next card in the same column', () => {
        expect(resolveCardDeletionFocusTarget(columns, 'design/a.md')).toEqual({ cardInternalId: 'b', kind: 'card' })
    })

    it('targets the previous card when the deleted card is last', () => {
        expect(resolveCardDeletionFocusTarget(columns, 'design/c.md')).toEqual({ cardInternalId: 'b', kind: 'card' })
    })

    it('targets the Add card button when the deleted card is the only card', () => {
        expect(resolveCardDeletionFocusTarget(columns, 'design/d.md')).toEqual({ kind: 'add-card', status: 'done' })
    })

    it('returns null when the card is not on the board', () => {
        expect(resolveCardDeletionFocusTarget(columns, 'design/missing.md')).toBeNull()
    })
})

describe('focusCardDeletionTarget', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('focuses the card by internal ID without scrolling', () => {
        document.body.innerHTML = '<button data-card-internal-id="a"></button><button data-card-internal-id="b"></button>'
        const cardButton = document.querySelector<HTMLElement>('[data-card-internal-id="b"]')!
        const focusSpy = vi.spyOn(cardButton, 'focus')

        focusCardDeletionTarget(document.body, { cardInternalId: 'b', kind: 'card' })

        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
        expect(cardButton).toHaveFocus()
    })

    it('focuses the column Add card button without scrolling', () => {
        document.body.innerHTML = '<button data-add-card-status="active"></button><button data-add-card-status="done"></button>'
        const addButton = document.querySelector<HTMLElement>('[data-add-card-status="done"]')!
        const focusSpy = vi.spyOn(addButton, 'focus')

        focusCardDeletionTarget(document.body, { kind: 'add-card', status: 'done' })

        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
        expect(addButton).toHaveFocus()
    })
})
