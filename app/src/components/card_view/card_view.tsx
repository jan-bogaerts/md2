import { Box } from '@mui/material'
import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildCardColumns } from '../../data/card_ordering'
import type { CardTypeConfig, StateConfig } from '../../data/data_types'
import { useAgentAcknowledgements } from '../hooks/use_agent_acknowledgements'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { openFilesService } from '../../services/open_files_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { AffectsEditorDialog } from './affects_editor_dialog'
import { CardActionPopupHost } from '../actions/card_action_popup_host'
import { CardBodyPopover } from './card_body_popover'
import { cardBodyPopoverService } from './card_body_popover_service'
import { CardColumn } from './card_column'
import { CardDragOverlay } from './card_drag_overlay'
import { cardDragDropService } from './card_drag_drop_service'
import { resolveCardDragEvent, type CardVerticalBounds } from './card_drag'
import { useCardViewColumns } from './use_card_view_columns'

const DRAG_ACTIVATION_DISTANCE = 2
interface CardViewProps {
    cardTypes: CardTypeConfig[]
    isMobile: boolean
    states: StateConfig[]
}

function runCardEdit(action: () => void, fallbackMessage: string) {
    try {
        action()
    } catch (error) {
        dialogService.error(error, { fallbackMessage })
    }
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

function currentCardColumns(states: StateConfig[]) {
    const cards = dataService.getState().snapshot?.activeCards ?? []

    return buildCardColumns(cards, states)
}

/** Card view: status columns of draggable cards with card-anchored body popup access. */
export function CardView(props: CardViewProps) {
    const {
        cardTypes,
        isMobile,
        states,
    } = props
    useAgentAcknowledgements()
    const columns = useCardViewColumns(states)
    const [openAffectsPath, setOpenAffectsPath] = useState<string | null>(null)
    const initialCardBoundsRef = useRef(new Map<string, CardVerticalBounds>())
    const rootElementRef = useRef<HTMLDivElement>(null)
    const wasVisibleRef = useRef<boolean | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }))

    const handleOpenAffects = (path: string) => {
        setOpenAffectsPath(path)
    }

    const handleCloseAffects = () => {
        setOpenAffectsPath(null)
    }

    const clearActiveCard = useCallback(() => {
        cardDragDropService.endDrag()
        initialCardBoundsRef.current.clear()
    }, [])

    useEffect(() => {
        const updateVisibility = () => {
            const rootElement = rootElementRef.current
            if (!rootElement) throw new Error('Missing card view root element')

            const isVisible = workspaceViewService.getSnapshot().viewMode === 'cards'
            rootElement.style.display = isVisible ? 'flex' : 'none'
            if (wasVisibleRef.current === isVisible) return

            wasVisibleRef.current = isVisible
            if (isVisible) return

            queueMicrotask(() => {
                cardBodyPopoverService.close()
                setOpenAffectsPath((currentPath) => currentPath === null ? currentPath : null)
                clearActiveCard()
            })
        }

        updateVisibility()
        workspaceViewService.addEventListener('changed', updateVisibility)

        return () => workspaceViewService.removeEventListener('changed', updateVisibility)
    }, [clearActiveCard])

    useEffect(() => () => cardBodyPopoverService.close(), [])

    const handleDragStart = useCallback((event: DragStartEvent) => {
        initialCardBoundsRef.current = measureCardVerticalBounds()
        cardDragDropService.startDrag(
            String(event.active.id),
            event.active.rect.current.initial?.height ?? null,
            event.active.rect.current.initial?.width ?? null,
        )
    }, [])

    const handleDragMove = useCallback((event: DragMoveEvent) => {
        const { active, over } = event
        if (!over) {
            cardDragDropService.setDropPreview(null)
            return
        }

        const dragColumns = currentCardColumns(states)
        const drop = resolveCardDragEvent(dragColumns, event, initialCardBoundsRef.current)
        const sourceColumn = dragColumns.find((column) => column.cards.some((card) => card.path === String(active.id)))
        const dropPreview = drop && sourceColumn?.status !== drop.targetStatus ? drop : null
        cardDragDropService.setDropPreview(dropPreview)
    }, [states])

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event
        const drop = over ? resolveCardDragEvent(currentCardColumns(states), event, initialCardBoundsRef.current) : null
        clearActiveCard()
        const path = String(active.id)
        if (drop) runCardEdit(() => dataService.cards.moveCard(path, drop.targetStatus, drop.targetIndex), `Card move failed: ${path}`)
    }, [clearActiveCard, states])

    const handleOpenInFileMode = (path: string) => {
        cardBodyPopoverService.close()
        workspaceViewService.selectPath(path)
        runCardEdit(() => openFilesService.openPath(path), `File open failed: ${path}`)
        workspaceViewService.setViewMode('text')
        telemetryService.trackEvent('navigation')
    }

    const handleDeleteCard = async (path: string) => {
        try {
            await dataService.cards.deleteCard(path)
            workspaceViewService.clearSelectedPath(path)
            cardBodyPopoverService.closePath(path)
            if (openAffectsPath === path) handleCloseAffects()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Card delete failed: ${path}` })
            throw error
        }
    }

    const handleTitleChange = (path: string, title: string) => {
        dataService.cards.updateCardTitle(path, title).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: `Title update failed: ${path}` })
        })
    }

    const handleTogglePolicy = (path: string, policyKey: string) => {
        runCardEdit(() => dataService.cards.toggleCardPolicy(path, policyKey), `Policy toggle failed: ${path}`)
    }

    const handleAffectsChange = (path: string, affects: string[]) => {
        runCardEdit(() => dataService.cards.updateCardAffects(path, affects), `Affects update failed: ${path}`)
    }

    return (
        <Box
            ref={rootElementRef}
            sx={{ bgcolor: 'background.default', display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
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
                    sx={{
                        alignItems: 'flex-start',
                        display: 'flex',
                        flex: 1,
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
                            onDeleteCard={handleDeleteCard}
                            onOpenInFileMode={handleOpenInFileMode}
                            onTitleChange={handleTitleChange}
                            onTogglePolicy={handleTogglePolicy}
                        />
                    ))}
                </Box>
                <DragOverlay>
                    <CardDragOverlay cardTypes={cardTypes} />
                </DragOverlay>
                <CardBodyPopover
                    isMobile={isMobile}
                    onDeleteCard={handleDeleteCard}
                    onOpenAffects={handleOpenAffects}
                    onOpenInFileMode={handleOpenInFileMode}
                    visible
                />
                <AffectsEditorDialog
                    cardPath={openAffectsPath}
                    onClose={handleCloseAffects}
                    onSave={handleAffectsChange}
                />
                <CardActionPopupHost />
            </DndContext>
        </Box>
    )
}
