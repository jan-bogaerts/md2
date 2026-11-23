import type { CardColumn } from '../../data/card_ordering'

export const CARD_INTERNAL_ID_ATTRIBUTE = 'data-card-internal-id'
export const ADD_CARD_STATUS_ATTRIBUTE = 'data-add-card-status'

/** Element that receives focus after a card is deleted: a neighbouring card or the column's Add card button. */
export type CardDeletionFocusTarget =
    | { cardInternalId: string, kind: 'card' }
    | { kind: 'add-card', status: string }

/**
 * Resolve the focus target for deleting a card: the next card in its column,
 * the previous card when it is last, or the column's Add card button when it is the only card.
 */
export function resolveCardDeletionFocusTarget(columns: CardColumn[], path: string): CardDeletionFocusTarget | null {
    const column = columns.find(({ cards }) => cards.some((card) => card.path === path))
    if (!column) return null

    const index = column.cards.findIndex((card) => card.path === path)
    const replacement = column.cards[index + 1] ?? column.cards[index - 1]
    const cardInternalId = replacement?.header.internalId
    if (cardInternalId) return { cardInternalId, kind: 'card' }

    return { kind: 'add-card', status: column.status }
}

/** Focus the deletion target inside the board without scrolling the board container. */
export function focusCardDeletionTarget(rootElement: HTMLElement, target: CardDeletionFocusTarget) {
    const attribute = target.kind === 'card' ? CARD_INTERNAL_ID_ATTRIBUTE : ADD_CARD_STATUS_ATTRIBUTE
    const value = target.kind === 'card' ? target.cardInternalId : target.status
    const candidates = [...rootElement.querySelectorAll<HTMLElement>(`[${attribute}]`)]
    const element = candidates.find((candidate) => candidate.getAttribute(attribute) === value)
    element?.focus({ preventScroll: true })
}
