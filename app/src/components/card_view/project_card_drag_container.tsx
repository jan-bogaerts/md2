import { styled } from '@mui/material/styles'
import { useSortable } from '@dnd-kit/sortable'
import { useCallback } from 'react'
import type { MouseEventHandler, ReactNode } from 'react'

export interface CardDragInteractions {
    onClick: MouseEventHandler<HTMLElement>
    onContextMenu: MouseEventHandler<HTMLElement>
}

const CardDragSurface = styled('div')(({ theme }) => ({
    backgroundColor: theme.palette.background.paper,
    border: '1px solid',
    borderColor: theme.palette.divider,
    borderRadius: 10,
    boxShadow: 'var(--md2-card-shadow)',
    overflow: 'hidden',
    position: 'relative',
    '&[data-dragging="true"]': {
        boxShadow: 'var(--md2-card-drag-shadow)',
        opacity: 0,
    },
    '&[data-selected="true"]': { borderColor: theme.palette.primary.main },
    '&:hover': {
        borderColor: theme.palette.text.disabled,
        boxShadow: 'var(--md2-card-hover-shadow)',
    },
}))

const CardDragButton = styled('button')(({ theme }) => ({
    backgroundColor: 'transparent',
    border: 0,
    cursor: 'pointer',
    inset: 0,
    position: 'absolute',
    zIndex: 1,
    '&[data-dragging="true"]': { cursor: 'grabbing' },
    '&:focus-visible': {
        outline: `2px solid ${theme.palette.primary.main}`,
        outlineOffset: -2,
    },
}))

interface CardDragContainerProps {
    cardId: string
    cardPath: string
    children: ReactNode
    interactions: CardDragInteractions
    isBodyOpen: boolean
    isMobile: boolean
    isSelected: boolean
    onCardElementChange: (element: HTMLDivElement | null) => void
}

/** Lightweight sortable adapter that updates only card drag DOM around stable card content. */
export function CardDragContainer(props: CardDragContainerProps) {
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
        <CardDragSurface
            data-card-path={cardPath}
            data-dragging={isDragging ? 'true' : undefined}
            data-selected={isSelected ? 'true' : undefined}
            onContextMenu={onContextMenu}
            ref={setCardElement}
            style={{ transform: transformStyle, transition }}
        >
            <CardDragButton
                {...attributes}
                {...listeners}
                aria-expanded={isBodyOpen}
                aria-haspopup="dialog"
                aria-label={`Drag ${cardId}`}
                onClick={onClick}
                ref={setActivatorNodeRef}
                data-dragging={isDragging ? 'true' : undefined}
                style={{ touchAction: isMobile ? 'pan-y' : 'none' }}
                type="button"
            />
            {children}
        </CardDragSurface>
    )
}
