import { Box } from '@mui/material'
import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildCardColumns } from '../../data/card_ordering'
import type { CardTypeConfig, ProjectCard, StateConfig } from '../../data/data_types'
import { useWorktrees } from '../hooks/use_worktrees'
import { useAgentAcknowledgements } from '../hooks/use_agent_acknowledgements'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { AffectsEditorDialog } from './affects_editor_dialog'
import { CardBodyPopover } from './card_body_popover'
import { CardColumn } from './card_column'
import { CardDragOverlay } from './card_drag_overlay'
import { COLUMN_DROP_PREFIX, getCardDropPlacement, resolveDrop, type DropTarget } from './card_drag'

const DRAG_ACTIVATION_DISTANCE = 2

interface CardViewProps {
    cardTypes: CardTypeConfig[]
    cards: ProjectCard[]
    isMobile: boolean
    onAffectsChange: (path: string, affects: string[]) => void
    onDeleteCard: (path: string) => Promise<void>
    onMoveCard: (path: string, targetStatus: string, targetIndex: number) => void
    onOpenInFileMode: (path: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
    primaryPath: string
    projectKey: string
    repositoryFiles: string[]
    selectedPath: string | null
    states: StateConfig[]
    visible: boolean
}

type CardDragPositionEvent = DragEndEvent | DragMoveEvent

interface CardVerticalBounds {
    height: number
    top: number
}

function measureCardVerticalBounds(): Map<string, CardVerticalBounds> {
    const boundsByPath = new Map<string, CardVerticalBounds>()
    const cardElements = document.querySelectorAll<HTMLElement>('[data-card-path]')
    for (const cardElement of cardElements) {
        const path = cardElement.dataset.cardPath
        if (!path) throw new Error('Card element is missing its path')

        const { height, top } = cardElement.getBoundingClientRect()
        boundsByPath.set(path, { height, top })
    }

    return boundsByPath
}

function getPointerY(event: CardDragPositionEvent): number {
    const { activatorEvent, delta } = event
    if (!('clientY' in activatorEvent) || typeof activatorEvent.clientY !== 'number') {
        throw new Error('Card dragging requires a pointer event with a vertical position')
    }

    return activatorEvent.clientY + delta.y
}

function resolveEventDrop(
    columns: ReturnType<typeof buildCardColumns>,
    event: CardDragPositionEvent,
    initialCardBounds: Map<string, CardVerticalBounds>,
): DropTarget | null {
    const { active, over } = event
    if (!over) return null

    const overId = String(over.id)
    const cardBounds = initialCardBounds.get(overId)
    if (!cardBounds && !overId.startsWith(COLUMN_DROP_PREFIX)) throw new Error(`Missing initial bounds for card: ${overId}`)

    const cardTop = cardBounds?.top ?? over.rect.top
    const cardHeight = cardBounds?.height ?? over.rect.height
    const pointerY = getPointerY(event)
    const cardDropPlacement = getCardDropPlacement(pointerY, cardTop, cardHeight)

    return resolveDrop(columns, String(active.id), overId, cardDropPlacement)
}

/** Card view: status columns of draggable cards with card-anchored body popup access. */
export function CardView(props: CardViewProps) {
    const {
        cardTypes,
        cards,
        isMobile,
        onAffectsChange,
        onDeleteCard,
        onMoveCard,
        onOpenInFileMode,
        onTogglePolicy,
        onTitleChange,
        primaryPath,
        projectKey,
        repositoryFiles,
        selectedPath,
        states,
        visible,
    } = props
    const worktrees = useWorktrees()
    useAgentAcknowledgements()
    const columns = useMemo(() => buildCardColumns(cards, states), [cards, states])
    const [openBodyPath, setOpenBodyPath] = useState<string | null>(null)
    const [bodyAnchorElement, setBodyAnchorElement] = useState<HTMLElement | null>(null)
    const [openAffectsPath, setOpenAffectsPath] = useState<string | null>(null)
    const [activeCardPath, setActiveCardPath] = useState<string | null>(null)
    const [activeCardHeight, setActiveCardHeight] = useState<number | null>(null)
    const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null)
    const [dropPreview, setDropPreview] = useState<DropTarget | null>(null)
    const initialCardBoundsRef = useRef(new Map<string, CardVerticalBounds>())
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

    const clearActiveCard = () => {
        setActiveCardPath(null)
        setActiveCardHeight(null)
        setActiveCardWidth(null)
        setDropPreview(null)
        initialCardBoundsRef.current.clear()
    }

    useEffect(() => {
        if (visible) return

        queueMicrotask(() => {
            setOpenBodyPath(null)
            setBodyAnchorElement(null)
            setOpenAffectsPath(null)
            setActiveCardPath(null)
            setActiveCardHeight(null)
            setActiveCardWidth(null)
            setDropPreview(null)
            initialCardBoundsRef.current.clear()
        })
    }, [visible])

    const handleDragStart = (event: DragStartEvent) => {
        initialCardBoundsRef.current = measureCardVerticalBounds()
        setActiveCardPath(String(event.active.id))
        setActiveCardHeight(event.active.rect.current.initial?.height ?? null)
        setActiveCardWidth(event.active.rect.current.initial?.width ?? null)
    }

    const handleDragMove = (event: DragMoveEvent) => {
        const { active, over } = event
        if (!over) {
            setDropPreview(null)
            return
        }

        const drop = resolveEventDrop(columns, event, initialCardBoundsRef.current)
        const sourceColumn = columns.find((column) => column.cards.some((card) => card.path === String(active.id)))
        setDropPreview(drop && sourceColumn?.status !== drop.targetStatus ? drop : null)
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        const drop = over ? resolveEventDrop(columns, event, initialCardBoundsRef.current) : null
        clearActiveCard()
        if (drop) onMoveCard(String(active.id), drop.targetStatus, drop.targetIndex)
    }

    const activeCard = cards.find((card) => card.path === activeCardPath) ?? null

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
        <DndContext
            collisionDetection={closestCorners}
            onDragCancel={clearActiveCard}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            onDragStart={handleDragStart}
            sensors={sensors}
        >
            <Box
                aria-label="Card columns"
                hidden={!visible}
                sx={{
                    alignItems: 'flex-start',
                    display: visible ? 'flex' : 'none',
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
                        dropPreviewHeight={dropPreview?.targetStatus === column.status ? activeCardHeight : null}
                        dropPreviewIndex={dropPreview?.targetStatus === column.status ? dropPreview.targetIndex : null}
                        isMobile={isMobile}
                        onDeleteCard={handleDeleteCard}
                        onOpenBody={handleOpenBody}
                        onOpenInFileMode={handleOpenInFileMode}
                        onTitleChange={onTitleChange}
                        onTogglePolicy={onTogglePolicy}
                        openBodyPath={openBodyPath}
                        primaryPath={primaryPath}
                        projectKey={projectKey}
                        selectedPath={selectedPath}
                        worktrees={worktrees}
                    />
                ))}
            </Box>
            <DragOverlay>
                {visible && activeCard ? <CardDragOverlay card={activeCard} cardTypes={cardTypes} width={activeCardWidth} /> : null}
            </DragOverlay>
            <CardBodyPopover
                anchorElement={bodyAnchorElement}
                card={openCard}
                isMobile={isMobile}
                onClose={handleCloseBody}
                onDeleteCard={handleDeleteCard}
                onOpenAffects={handleOpenAffects}
                onOpenInFileMode={handleOpenInFileMode}
                onTitleChange={onTitleChange}
                visible={visible}
            />
            <AffectsEditorDialog
                card={visible ? affectsCard : null}
                onClose={handleCloseAffects}
                onSave={onAffectsChange}
                repositoryFiles={repositoryFiles}
            />
        </DndContext>
    )
}
