import { arrayMove } from '@dnd-kit/sortable'
import type { StateConfig } from '../../data/data_types'

/** Move the dragged column to the position of the column it was dropped on. */
export function reorderColumns(states: StateConfig[], activeId: string, overId: string) {
    if (activeId === overId) return states
    const activeIndex = states.findIndex((column) => column.state === activeId)
    const overIndex = states.findIndex((column) => column.state === overId)
    if (activeIndex < 0 || overIndex < 0) return states

    return arrayMove(states, activeIndex, overIndex)
}
