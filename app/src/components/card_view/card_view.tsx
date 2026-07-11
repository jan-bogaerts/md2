import { Box } from '@mui/material'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { buildCardColumns } from '../../data/card_ordering'
import type { AgentConversation, CardTypeConfig, ProjectCard, StateConfig } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'
import { AffectsEditorDialog } from './affects_editor_dialog'
import { CardBodyPopover } from './card_body_popover'
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
    states: StateConfig[]
}

/** Card view: status columns of draggable cards with card-anchored body popup access. */
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
        states,
    } = props
    const columns = useMemo(() => buildCardColumns(cards, states), [cards, states])
    const [openBodyPath, setOpenBodyPath] = useState<string | null>(null)
    const [bodyAnchorElement, setBodyAnchorElement] = useState<HTMLElement | null>(null)
    const [openAffectsPath, setOpenAffectsPath] = useState<string | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }))

    const handleOpenBody = (path: string, anchorElement: HTMLElement) => {
        const isClosing = openBodyPath === path
        setOpenBodyPath(isClosing ? null : path)
        setBodyAnchorElement(isClosing ? null : anchorElement)
        telemetryService.trackEvent('navigation')
    }

    const handleCloseBody = () => {
        setOpenBodyPath(null)
        setBodyAnchorElement(null)
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
        handleCloseBody()
        onOpenInFileMode(path)
    }

    const handleDeleteCard = async (path: string) => {
        await onDeleteCard(path)
        if (openBodyPath === path) handleCloseBody()
        if (openAffectsPath === path) handleCloseAffects()
    }

    const openCard = cards.find((card) => card.path === openBodyPath) ?? null
    const affectsCard = cards.find((card) => card.path === openAffectsPath) ?? null

    return (
        <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd} sensors={sensors}>
            <Box
                aria-label="Card columns"
                sx={{
                    alignItems: 'flex-start',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: 2,
                    height: '100%',
                    overflowX: isMobile ? 'visible' : 'auto',
                    p: 2.5,
                }}
            >
                {columns.map((column) => (
                    <CardColumn
                        key={column.status}
                        cardTypes={cardTypes}
                        column={column}
                        isMobile={isMobile}
                        onContinueAgentConversation={onContinueAgentConversation}
                        onDeleteCard={handleDeleteCard}
                        onOpenBody={handleOpenBody}
                        onOpenInFileMode={handleOpenInFileMode}
                        onSendAgentInput={onSendAgentInput}
                        onStartAgentConversation={onStartAgentConversation}
                        onTitleChange={onTitleChange}
                        onTogglePolicy={onTogglePolicy}
                        openBodyPath={openBodyPath}
                        selectedPath={selectedPath}
                    />
                ))}
            </Box>
            <CardBodyPopover
                anchorElement={bodyAnchorElement}
                card={openCard}
                isMobile={isMobile}
                onBodyChange={onBodyChange}
                onClose={handleCloseBody}
                onDeleteCard={handleDeleteCard}
                onOpenAffects={handleOpenAffects}
                onOpenInFileMode={handleOpenInFileMode}
                onTitleChange={onTitleChange}
            />
            <AffectsEditorDialog
                card={affectsCard}
                onClose={handleCloseAffects}
                onSave={onAffectsChange}
                repositoryFiles={repositoryFiles}
            />
        </DndContext>
    )
}
