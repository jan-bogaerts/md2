import type { CardColumn } from '../../data/card_ordering'
import type { CardTypeConfig } from '../../data/data_types'
import { getCardIdPrefix } from '../../data/card_identifiers'
import type { DragEndEvent, DragMoveEvent, DragOverEvent } from '@dnd-kit/core'

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

type CardDragPositionEvent = DragEndEvent | DragMoveEvent | DragOverEvent

/** Resolve a DnD event by inserting at the hovered card or appending at the column end target. */
export function resolveCardDragEvent(columns: CardColumn[], event: CardDragPositionEvent): DropTarget | null {
    const { active, over } = event
    if (!over) return null

    return resolveDrop(columns, String(active.id), String(over.id))
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

    const targetIndex = targetColumn.cards.findIndex((card) => card.path === overId)

    return { targetIndex, targetStatus: targetColumn.status }
}

/** Resolve the configured type color for a card id via its prefix (e.g. `F-005` → `F`). */
export function getCardTypeColor(cardTypes: CardTypeConfig[], id: string): string | undefined {
    const prefix = getCardIdPrefix(id)

    return cardTypes.find((cardType) => cardType.idPrefix === prefix)?.color
}
