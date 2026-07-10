import { Stack } from '@mui/material'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { groupByStatus, UNASSIGNED_STATUS } from '../../data/card_ordering'
import type { AgentConversation, CardTypeConfig, ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'
import { AffectsEditorDialog } from './affects_editor_dialog'
import { CardBodyDialog } from './card_body_dialog'
import { CardColumn } from './card_column'
import { resolveDrop } from './card_drag'

const DRAG_ACTIVATION_DISTANCE = 5

interface CardViewProps {
    cardTypes: CardTypeConfig[]
    cards: ProjectCard[]
    isMobile: boolean
    onAffectsChange: (path: string, affects: string[]) => void
    onBodyChange: (path: string, body: string) => void
    onContinueAgentConversation: (path: string, conversation: AgentConversation) => void
    onDeleteCard: (path: string) => Promise<void>
    onMoveCard: (path: string, targetStatus: string, targetIndex: number) => void
    onOpenInFileMode: (path: string) => void
    onSendAgentInput: (runId: string, input: string) => void
    onStartAgentConversation: (path: string, prompt: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
    repositoryFiles: string[]
    selectedPath: string | null
}

/** Card view: status columns of draggable cards with body dialog/accordion access. */
export function CardView(props: CardViewProps) {
    const {
        cardTypes,
        cards,
        isMobile,
        onAffectsChange,
        onBodyChange,
        onContinueAgentConversation,
        onDeleteCard,
        onMoveCard,
        onOpenInFileMode,
        onSendAgentInput,
        onStartAgentConversation,
        onTogglePolicy,
        onTitleChange,
        repositoryFiles,
        selectedPath,
    } = props
    const columns = useMemo(() => {
        const groupedColumns = groupByStatus(cards)
        if (groupedColumns.length > 0) return groupedColumns

        return [{ cards: [], status: UNASSIGNED_STATUS }]
    }, [cards])
    const [openBodyPath, setOpenBodyPath] = useState<string | null>(null)
    const [openAffectsPath, setOpenAffectsPath] = useState<string | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }))

    const handleOpenBody = (path: string) => {
        setOpenBodyPath((current) => (current === path ? null : path))
        telemetryService.trackEvent('navigation')
    }

    const handleOpenAffects = (path: string) => {
        setOpenAffectsPath(path)
    }

    const handleCloseAffects = () => {
        setOpenAffectsPath(null)
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

    const handleDeleteCard = async (path: string) => {
        await onDeleteCard(path)
        if (openBodyPath === path) setOpenBodyPath(null)
        if (openAffectsPath === path) setOpenAffectsPath(null)
    }

    const openCard = cards.find((card) => card.path === openBodyPath) ?? null
    const affectsCard = cards.find((card) => card.path === openAffectsPath) ?? null

    return (
        <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd} sensors={sensors}>
            <Stack
                aria-label="Card columns"
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
                        onAffectsChange={onAffectsChange}
                        onBodyChange={onBodyChange}
                        onContinueAgentConversation={onContinueAgentConversation}
                        onDeleteCard={handleDeleteCard}
                        onOpenBody={handleOpenBody}
                        onOpenAffects={handleOpenAffects}
                        onOpenInFileMode={handleOpenInFileMode}
                        onSendAgentInput={onSendAgentInput}
                        onStartAgentConversation={onStartAgentConversation}
                        onTitleChange={onTitleChange}
                        onTogglePolicy={onTogglePolicy}
                        openBodyPath={openBodyPath}
                        selectedPath={selectedPath}
                    />
                ))}
            </Stack>
            {isMobile ? null : (
                <CardBodyDialog
                    card={openCard}
                    onBodyChange={onBodyChange}
                    onClose={() => setOpenBodyPath(null)}
                    onDeleteCard={handleDeleteCard}
                    onOpenInFileMode={handleOpenInFileMode}
                />
            )}
            <AffectsEditorDialog
                card={affectsCard}
                onClose={handleCloseAffects}
                onSave={onAffectsChange}
                repositoryFiles={repositoryFiles}
            />
        </DndContext>
    )
}
