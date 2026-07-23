import { Box } from '@mui/material'
import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { columnDropId } from './card_drag'

interface CardColumnDropTargetProps {
    children: ReactNode
    status: string
}

/** Lightweight dnd-kit adapter that keeps droppable context updates out of column content. */
export function CardColumnDropTarget(props: CardColumnDropTargetProps) {
    const { children, status } = props
    const { setNodeRef } = useDroppable({ id: columnDropId(status) })

    return (
        <Box ref={setNodeRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 52 }}>
            {children}
        </Box>
    )
}
