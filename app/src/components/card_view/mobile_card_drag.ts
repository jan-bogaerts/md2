import type { DragEndEvent, DragMoveEvent } from '@dnd-kit/core'
import type { CardColumn } from '../../data/card_ordering'
import { resolveCardDragEvent } from './card_drag'

/** Resolve only drops that remain inside selected mobile column. */
export function resolveMobileCardDragEvent(
    columns: CardColumn[],
    selectedStatus: string,
    event: DragEndEvent | DragMoveEvent,
) {
    const drop = resolveCardDragEvent(columns, event)

    return drop?.targetStatus === selectedStatus ? drop : null
}
