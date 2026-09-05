import { Box, Paper, Typography } from '@mui/material'
import {
    memo, useCallback, useRef, useState, useSyncExternalStore,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'
import { diagramMoveService, type DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service'
import { diagramResizeService, type DiagramResizeService } from '../../services/diagrams/diagram_resize_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import {
    diagramComparisonLayoutService, type DiagramComparisonLayoutService,
} from './diagram_comparison_layout_service'
import { DiagramRenderer } from './diagram_renderer'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import type { DiagramSelection } from './diagram_selection'
import { DiagramToolbox } from './diagram_toolbox'
import { DiagramZoomViewport } from './diagram_zoom_viewport'

const MINIMUM_PANE_HEIGHT = 160
const SEPARATOR_HEIGHT = 6
const KEYBOARD_RESIZE_STEP = 24
const MINIMUM_COMPARISON_HEIGHT = MINIMUM_PANE_HEIGHT * 2 + SEPARATOR_HEIGHT

interface DiagramComparisonProps {
    currentDiagram: PositionedDiagramData
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    geometry?: DiagramGeometryService
    layoutService?: DiagramComparisonLayoutService
    movement?: DiagramMoveService
    onCurrentSelect: (anchorElement: HTMLElement, selection: DiagramSelection) => void
    placement?: DiagramNodePlacementService
    resize?: DiagramResizeService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

const CurrentDiagram = memo(DiagramRenderer)

function availablePaneHeight(containerHeight: number) {
    return Math.max(containerHeight - SEPARATOR_HEIGHT, 0)
}

function clampTopPaneHeight(proposedHeight: number, availableHeight: number) {
    const minimumHeight = Math.min(MINIMUM_PANE_HEIGHT, availableHeight / 2)

    return Math.min(Math.max(proposedHeight, minimumHeight), availableHeight - minimumHeight)
}

function dividerRatioForHeight(proposedHeight: number, availableHeight: number) {
    if (availableHeight === 0) return 0.5

    return clampTopPaneHeight(proposedHeight, availableHeight) / availableHeight
}

/** Layout-only comparison root. Diagram changes remain inside New service-bound leaves. */
export function DiagramComparison({
    currentDiagram,
    details = diagramObjectDetailsService,
    drawing = diagramEdgeDrawingService,
    geometry = diagramGeometryService,
    layoutService = diagramComparisonLayoutService,
    movement = diagramMoveService,
    onCurrentSelect,
    placement = diagramNodePlacementService,
    resize = diagramResizeService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramComparisonProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [newViewportElement, setNewViewportElement] = useState<HTMLDivElement | null>(null)
    const activePointerIdRef = useRef<number | null>(null)
    const dividerRatio = useSyncExternalStore(
        layoutService.subscribeHorizontalDivider,
        layoutService.getHorizontalDividerSnapshot,
        layoutService.getHorizontalDividerSnapshot,
    )

    const setDividerFromClientY = useCallback((clientY: number) => {
        const container = containerRef.current
        if (!container) return

        const bounds = container.getBoundingClientRect()
        const availableHeight = availablePaneHeight(bounds.height)
        layoutService.setHorizontalDividerRatio(dividerRatioForHeight(clientY - bounds.top, availableHeight))
    }, [layoutService])

    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        activePointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }, [])

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        setDividerFromClientY(event.clientY)
    }, [setDividerFromClientY])

    const stopPointerResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        activePointerIdRef.current = null
        event.currentTarget.releasePointerCapture?.(event.pointerId)
    }, [])

    const handleSeparatorKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        const container = containerRef.current
        if (!container) return

        const availableHeight = availablePaneHeight(container.getBoundingClientRect().height)
        const currentHeight = dividerRatio * availableHeight
        const proposedHeightByKey: Record<string, number> = {
            ArrowDown: currentHeight + KEYBOARD_RESIZE_STEP,
            ArrowUp: currentHeight - KEYBOARD_RESIZE_STEP,
            End: availableHeight,
            Home: 0,
        }
        const proposedHeight = proposedHeightByKey[event.key]
        if (proposedHeight === undefined) return

        event.preventDefault()
        layoutService.setHorizontalDividerRatio(dividerRatioForHeight(proposedHeight, availableHeight))
    }, [dividerRatio, layoutService])

    return (
        <Box
            aria-label="Diagram comparison"
            ref={containerRef}
            sx={{
                display: 'grid',
                flex: 1,
                gridTemplateRows: `minmax(${MINIMUM_PANE_HEIGHT}px, ${dividerRatio}fr) ${SEPARATOR_HEIGHT}px minmax(${MINIMUM_PANE_HEIGHT}px, ${1 - dividerRatio}fr)`,
                minHeight: MINIMUM_COMPARISON_HEIGHT,
                overflow: 'hidden',
            }}
        >
            <Paper
                aria-label="Current"
                elevation={0}
                role="region"
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, minHeight: 0, overflow: 'auto', p: 2 }}
            >
                <Typography color="custom.colHead" sx={{ mb: 1 }} variant="overline">Current</Typography>
                <CurrentDiagram data={currentDiagram} onSelect={onCurrentSelect} />
            </Paper>
            <Box
                aria-label="Resize Current and New diagrams"
                aria-orientation="horizontal"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(dividerRatio * 100)}
                aria-valuetext={`Current pane ${Math.round(dividerRatio * 100)} percent`}
                onKeyDown={handleSeparatorKeyDown}
                onPointerCancel={stopPointerResize}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopPointerResize}
                role="separator"
                sx={{
                    bgcolor: 'divider',
                    cursor: 'row-resize',
                    touchAction: 'none',
                    '&:focus-visible': { bgcolor: 'primary.main', outline: 'none' },
                    '&:hover': { bgcolor: 'primary.main' },
                }}
                tabIndex={0}
            />
            <Paper
                aria-label="New"
                elevation={0}
                ref={setNewViewportElement}
                role="region"
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', position: 'relative' }}
            >
                <Typography color="custom.colHead" sx={{ flexShrink: 0, px: 2, pt: 2 }} variant="overline">New</Typography>
                <DiagramZoomViewport
                    details={details}
                    drawing={drawing}
                    geometry={geometry}
                    movement={movement}
                    placement={placement}
                    resize={resize}
                    selection={selection}
                    session={session}
                />
                <DiagramToolbox
                    boundaryElement={newViewportElement}
                    details={details}
                    drawing={drawing}
                    placement={placement}
                    session={session}
                />
            </Paper>
        </Box>
    )
}
