import { Stack } from '@mui/material'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { groupByStatus } from '../../data/card_ordering'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import { CardBodyDialog } from './card_body_dialog'
import { CardColumn } from './card_column'
import { resolveDrop } from './card_drag'

const DRAG_ACTIVATION_DISTANCE = 5

interface CardViewProps {
    cardTypes: CardTypeConfig[]
    cards: ProjectCard[]
    isMobile: boolean
    onBodyChange: (path: string, body: string) => void
    onMoveCard: (path: string, targetStatus: string, targetIndex: number) => void
    onOpenInFileMode: (path: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
}

/** Card view: status columns of draggable cards with body dialog/accordion access. */
export function CardView(props: CardViewProps) {
    const { cardTypes, cards, isMobile, onBodyChange, onMoveCard, onOpenInFileMode, onTogglePolicy, onTitleChange } = props
    const columns = useMemo(() => groupByStatus(cards), [cards])
    const [openBodyPath, setOpenBodyPath] = useState<string | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }))

    const handleOpenBody = (path: string) => {
        setOpenBodyPath((current) => (current === path ? null : path))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over) return

        const drop = resolveDrop(columns, String(active.id), String(over.id))
        if (drop) onMoveCard(String(active.id), drop.targetStatus, drop.targetIndex)
    }

    const handleOpenInFileMode = (path: string) => {
        setOpenBodyPath(null)
        onOpenInFileMode(path)
    }

    const openCard = cards.find((card) => card.path === openBodyPath) ?? null

    return (
        <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd} sensors={sensors}>
            <Stack
                direction={isMobile ? 'column' : 'row'}
                spacing={2}
                sx={{ alignItems: 'flex-start', overflowX: isMobile ? 'visible' : 'auto', pb: 1 }}
            >
                {columns.map((column) => (
                    <CardColumn
                        key={column.status}
                        cardTypes={cardTypes}
                        column={column}
                        isMobile={isMobile}
                        onBodyChange={onBodyChange}
                        onOpenBody={handleOpenBody}
                        onOpenInFileMode={handleOpenInFileMode}
                        onTitleChange={onTitleChange}
                        onTogglePolicy={onTogglePolicy}
                        openBodyPath={openBodyPath}
                    />
                ))}
            </Stack>
            {isMobile ? null : (
                <CardBodyDialog
                    card={openCard}
                    onBodyChange={onBodyChange}
                    onClose={() => setOpenBodyPath(null)}
                    onOpenInFileMode={handleOpenInFileMode}
                />
            )}
        </DndContext>
    )
}
