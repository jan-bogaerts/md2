import { Box } from '@mui/material'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildCardColumns } from '../../data/card_ordering'
import type { CardTypeConfig, StateConfig } from '../../data/data_types'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { openFilesService } from '../../services/open_files_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { CardActionPopupHost } from '../actions/card_action_popup_host'
import { AffectsEditorDialog } from './affects_editor_dialog'
import { CardBodyPopover } from './card_body_popover'
import { cardBodyPopoverService } from './card_body_popover_service'
import { CardColumn } from './card_column'
import { CardDragOverlay } from './card_drag_overlay'
import { cardDragDropService } from './card_drag_drop_service'
import { useCardViewColumns } from './use_card_view_columns'
import { useMobileCardViewColumn } from './use_mobile_card_view_column'
import { resolveMobileCardDragEvent } from './mobile_card_drag'

const LONG_PRESS_DELAY_MS = 500
const LONG_PRESS_TOLERANCE = 5

interface MobileCardViewProps {
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

/** Mobile board showing one selected column with delayed touch dragging. */
export function MobileCardView(props: MobileCardViewProps) {
    const { cardTypes, states, statusColors } = props
    const columns = useCardViewColumns(states)
    const selectedColumn = useMobileCardViewColumn(columns)
    const [openAffectsPath, setOpenAffectsPath] = useState<string | null>(null)
    const rootElementRef = useRef<HTMLDivElement>(null)
    const wasVisibleRef = useRef<boolean | null>(null)
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { delay: LONG_PRESS_DELAY_MS, tolerance: LONG_PRESS_TOLERANCE } }),
        useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_DELAY_MS, tolerance: LONG_PRESS_TOLERANCE } }),
    )

    const clearActiveCard = useCallback(() => {
        cardDragDropService.endDrag()
    }, [])

    const handleCloseAffects = () => {
        setOpenAffectsPath(null)
    }

    useEffect(() => {
        const updateVisibility = () => {
            const rootElement = rootElementRef.current
            if (!rootElement) return

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
        if (!selectedColumn) return

        cardDragDropService.setDropPreview(resolveMobileCardDragEvent(currentCardColumns(states), selectedColumn.status, event))
    }, [selectedColumn, states])

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const drop = selectedColumn ? resolveMobileCardDragEvent(currentCardColumns(states), selectedColumn.status, event) : null
        clearActiveCard()
        const path = String(event.active.id)
        if (drop) void runCardEdit(() => dataService.cards.moveCard(path, drop.targetStatus, drop.targetIndex), `Card move failed: ${path}`)
    }, [clearActiveCard, selectedColumn, states])

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
            if (openAffectsPath === path) setOpenAffectsPath(null)
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
            aria-label="Mobile card board"
            ref={rootElementRef}
            sx={{ bgcolor: 'background.default', display: 'flex', flex: 1, minHeight: 0, overflowX: 'hidden', overflowY: 'auto' }}
        >
            <DndContext
                collisionDetection={closestCorners}
                onDragCancel={clearActiveCard}
                onDragEnd={handleDragEnd}
                onDragMove={handleDragMove}
                onDragStart={handleDragStart}
                sensors={sensors}
            >
                <Box aria-label="Mobile card column" sx={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
                    {selectedColumn ? (
                        <CardColumn
                            cardTypes={cardTypes}
                            column={selectedColumn}
                            isMobile
                            onDeleteCard={handleDeleteCard}
                            onOpenInFileMode={handleOpenInFileMode}
                            onTitleChange={handleTitleChange}
                            onTogglePolicy={handleTogglePolicy}
                        />
                    ) : null}
                </Box>
                <DragOverlay><CardDragOverlay cardTypes={cardTypes} /></DragOverlay>
                <CardBodyPopover
                    cardTypes={cardTypes}
                    isMobile
                    onDeleteCard={handleDeleteCard}
                    onOpenAffects={setOpenAffectsPath}
                    onOpenInFileMode={handleOpenInFileMode}
                    statusColors={statusColors}
                    visible
                />
                <AffectsEditorDialog cardPath={openAffectsPath} onClose={handleCloseAffects} onSave={handleAffectsChange} />
                <CardActionPopupHost />
            </DndContext>
        </Box>
    )
}
