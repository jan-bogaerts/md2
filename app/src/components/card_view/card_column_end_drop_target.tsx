import { Box } from '@mui/material'
import { useDroppable } from '@dnd-kit/core'
import { columnDropId } from './card_drag'

interface CardColumnEndDropTargetProps {
    status: string
}

/** Dedicated target after all cards for appending a dragged card to a column. */
export function CardColumnEndDropTarget(props: CardColumnEndDropTargetProps) {
    const { status } = props
    const { setNodeRef } = useDroppable({ id: columnDropId(status) })
    const columnLabel = status || 'Unassigned'

    return <Box aria-label={`${columnLabel} column end drop target`} ref={setNodeRef} sx={{ minHeight: 24 }} />
}
