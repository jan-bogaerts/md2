import { Box } from '@mui/material'
import { useSortable } from '@dnd-kit/sortable'
import { useCallback } from 'react'
import type { MouseEventHandler, ReactNode } from 'react'

export interface ProjectCardDragInteractions {
    onClick: MouseEventHandler<HTMLElement>
    onContextMenu: MouseEventHandler<HTMLElement>
}

interface ProjectCardDragContainerProps {
    cardId: string
    cardPath: string
    children: ReactNode
    interactions: ProjectCardDragInteractions
    isBodyOpen: boolean
    isMobile: boolean
    isSelected: boolean
    onCardElementChange: (element: HTMLDivElement | null) => void
}

/** Lightweight sortable adapter that updates only card drag DOM around stable card content. */
export function ProjectCardDragContainer(props: ProjectCardDragContainerProps) {
    const {cardId, cardPath, children, interactions, isBodyOpen, isMobile, isSelected, onCardElementChange} = props
    const { onClick, onContextMenu } = interactions
    const sortable = useSortable({ id: cardPath })
    const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = sortable
    const dragTranslation = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : ''
    const transformStyle = `${dragTranslation}${isDragging ? ' rotate(2deg)' : ''}`.trim() || undefined
    const setCardElement = useCallback((element: HTMLDivElement | null) => {
        setNodeRef(element)
        onCardElementChange(element)
    }, [onCardElementChange, setNodeRef])

    return (
        <Box
            data-card-path={cardPath}
            data-selected={isSelected ? 'true' : undefined}
            onContextMenu={onContextMenu}
            ref={setCardElement}
            sx={{
                bgcolor: 'background.paper',
                border: 1,
                borderColor: isSelected ? 'primary.main' : 'divider',
                borderRadius: 1.25,
                boxShadow: isDragging ? 'var(--md2-card-drag-shadow)' : 'var(--md2-card-shadow)',
                opacity: isDragging ? 0 : 1,
                overflow: 'hidden',
                position: 'relative',
                transform: transformStyle,
                transition,
                '&:hover': { borderColor: 'text.disabled', boxShadow: 'var(--md2-card-hover-shadow)' },
            }}
        >
            <Box
                {...attributes}
                {...listeners}
                aria-expanded={isBodyOpen}
                aria-haspopup="dialog"
                aria-label={`Drag ${cardId}`}
                component="button"
                onClick={onClick}
                ref={setActivatorNodeRef}
                sx={{
                    bgcolor: 'transparent',
                    border: 0,
                    cursor: isDragging ? 'grabbing' : 'pointer',
                    inset: 0,
                    position: 'absolute',
                    touchAction: isMobile ? 'pan-y' : 'none',
                    zIndex: 1,
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
                type="button"
            />
            {children}
        </Box>
    )
}
