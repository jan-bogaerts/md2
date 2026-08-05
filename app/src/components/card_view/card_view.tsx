import { Box } from '@mui/material'
import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { flushSync } from 'react-dom'
import { buildCardColumns } from '../../data/card_ordering'
import type { CardTypeConfig, StateConfig } from '../../data/data_types'
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
import { resolveCardDragEvent } from './card_drag'
import { useCardViewColumns } from './use_card_view_columns'

const DRAG_ACTIVATION_DISTANCE = 2
interface CardViewProps {
    cardTypes: CardTypeConfig[]
    states: StateConfig[]
    statusColors: Map<string, string>
}

async function runCardEdit(action: () => unknown, fallbackMessage: string) {
    try {
        await action()
    } catch (error) {
        dialogService.error(error, { fallbackMessage })
    }
}

function currentCardColumns(states: StateConfig[]) {
    const cards = dataService.getState().snapshot?.activeCards ?? []

    return buildCardColumns(cards, states)
}

/** Card view: status columns of draggable cards with card-anchored body popup access. */
export function CardView(props: CardViewProps) {
    const {
        cardTypes,
        states,
        statusColors,
    } = props
    const columns = useCardViewColumns(states)
    const [openAffectsPath, setOpenAffectsPath] = useState<string | null>(null)
    const rootElementRef = useRef<HTMLDivElement>(null)
    const missingRootReportedRef = useRef(false)
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
    }, [])

    useEffect(() => {
        const updateVisibility = () => {
            const rootElement = rootElementRef.current
            if (!rootElement) {
                if (!missingRootReportedRef.current) {
                    missingRootReportedRef.current = true
                    dialogService.error(new Error('Missing card view root element'), {fallbackMessage: 'Card view could not be displayed'})
                }
                return
            }

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
        const drop = resolveCardDragEvent(dragColumns, event)
        const sourceColumn = dragColumns.find((column) => column.cards.some((card) => card.path === String(active.id)))
        const dropPreview = drop && sourceColumn?.status !== drop.targetStatus ? drop : null
        cardDragDropService.setDropPreview(dropPreview)
    }, [states])

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event
        const drop = over ? resolveCardDragEvent(currentCardColumns(states), event) : null
        const path = String(active.id)
        if (!drop) {
            clearActiveCard()
            return
        }

        flushSync(() => {
            void runCardEdit(() => dataService.cards.moveCard(path, drop.targetStatus, drop.targetIndex), `Card move failed: ${path}`)
            clearActiveCard()
        })
    }, [clearActiveCard, states])

    const handleOpenInFileMode = (path: string) => {
        cardBodyPopoverService.close()
        workspaceViewService.selectPath(path)
        void runCardEdit(() => openFilesService.openPath(path), `File open failed: ${path}`)
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
        void runCardEdit(() => dataService.cards.toggleCardPolicy(path, policyKey), `Policy toggle failed: ${path}`)
    }

    const handleAffectsChange = (path: string, affects: string[]) => {
        void runCardEdit(() => dataService.cards.updateCardAffects(path, affects), `Affects update failed: ${path}`)
    }

    return (
        <Box
            ref={rootElementRef}
            sx={{ bgcolor: 'background.default', display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
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
                        flexDirection: 'row',
                        gap: 2,
                        height: '100%',
                        overflowX: 'auto',
                        overflowY: 'auto',
                        p: 2.5,
                    }}
                >
                    {columns.map((column) => (
                        <CardColumn
                            key={column.status}
                            cardTypes={cardTypes}
                            column={column}
                            isMobile={false}
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
                    cardTypes={cardTypes}
                    isMobile={false}
                    onDeleteCard={handleDeleteCard}
                    onOpenAffects={handleOpenAffects}
                    onOpenInFileMode={handleOpenInFileMode}
                    statusColors={statusColors}
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
