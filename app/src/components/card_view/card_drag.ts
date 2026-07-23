import type { CardColumn } from '../../data/card_ordering'
import type { CardTypeConfig } from '../../data/data_types'
import { getCardIdPrefix } from '../../data/card_identifiers'
import type { DragEndEvent, DragMoveEvent } from '@dnd-kit/core'

/** Droppable ids for empty/append targets are the status prefixed with this. */
export const COLUMN_DROP_PREFIX = 'column:'

/** Build the droppable id for a status column. */
export function columnDropId(status: string) {
    return `${COLUMN_DROP_PREFIX}${status}`
}

export interface DropTarget {
    targetIndex: number
    targetStatus: string
}

export type CardDropPlacement = 'after' | 'before'

export interface CardVerticalBounds {
    height: number
    top: number
}

type CardDragPositionEvent = DragEndEvent | DragMoveEvent

function getPointerY(event: CardDragPositionEvent): number {
    const { activatorEvent, delta } = event
    if (!('clientY' in activatorEvent) || typeof activatorEvent.clientY !== 'number') {
        throw new Error('Card dragging requires a pointer event with a vertical position')
    }

    return activatorEvent.clientY + delta.y
}

/** Resolve whether the pointer targets the half before or after a hovered card. */
export function getCardDropPlacement(pointerY: number, cardTop: number, cardHeight: number): CardDropPlacement {
    const cardMiddleY = cardTop + cardHeight / 2

    return pointerY < cardMiddleY ? 'before' : 'after'
}

/** Resolve a DnD event using stable drag-start bounds when available and current collision bounds otherwise. */
export function resolveCardDragEvent(
    columns: CardColumn[],
    event: CardDragPositionEvent,
    initialCardBounds: Map<string, CardVerticalBounds>,
): DropTarget | null {
    const { active, over } = event
    if (!over) return null

    const overId = String(over.id)
    const cardBounds = initialCardBounds.get(overId)
    const cardTop = cardBounds?.top ?? over.rect.top
    const cardHeight = cardBounds?.height ?? over.rect.height
    const pointerY = getPointerY(event)
    const cardDropPlacement = getCardDropPlacement(pointerY, cardTop, cardHeight)

    return resolveDrop(columns, String(active.id), overId, cardDropPlacement)
}

/**
 * Translate a drag end (active card path, the id it was dropped over) into the
 * target status and the insert index within the destination column's cards
 * excluding the dragged card. Returns null for a drop that changes nothing.
 */
export function resolveDrop(
    columns: CardColumn[],
    activePath: string,
    overId: string,
    cardDropPlacement: CardDropPlacement,
): DropTarget | null {
    if (activePath === overId) return null

    if (overId.startsWith(COLUMN_DROP_PREFIX)) {
        const status = overId.slice(COLUMN_DROP_PREFIX.length)
        const column = columns.find((entry) => entry.status === status)
        if (!column) return null

        const remaining = column.cards.filter((card) => card.path !== activePath)

        return { targetIndex: remaining.length, targetStatus: status }
    }

    const targetColumn = columns.find((entry) => entry.cards.some((card) => card.path === overId))
    if (!targetColumn) return null

    const remaining = targetColumn.cards.filter((card) => card.path !== activePath)
    const overIndex = remaining.findIndex((card) => card.path === overId)
    const targetIndex = overIndex === -1 ? remaining.length : overIndex + (cardDropPlacement === 'after' ? 1 : 0)

    return { targetIndex, targetStatus: targetColumn.status }
}

/** Resolve the configured type color for a card id via its prefix (e.g. `F-005` → `F`). */
export function getCardTypeColor(cardTypes: CardTypeConfig[], id: string): string | undefined {
    const prefix = getCardIdPrefix(id)

    return cardTypes.find((cardType) => cardType.idPrefix === prefix)?.color
}
