import { Box, Paper, Typography } from '@mui/material'
import {
    memo, useCallback, useRef, useSyncExternalStore,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'
import { diagramMoveService, type DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import { diagramResizeService, type DiagramResizeService } from '../../services/diagrams/diagram_resize_service'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service'
import {
    diagramGroupDrawingService, type DiagramGroupDrawingService,
} from '../../services/diagrams/diagram_group_drawing_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import {
    diagramComparisonLayoutService, type DiagramComparisonLayoutService,
} from './diagram_comparison_layout_service'
import { DiagramRenderer } from './diagram_renderer'
import type { DiagramSelection } from './diagram_selection'
import { DiagramNewPane } from './diagram_new_pane'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

const MINIMUM_PANE_WIDTH = 240
const SEPARATOR_WIDTH = 6
const KEYBOARD_RESIZE_STEP = 24
const MINIMUM_COMPARISON_WIDTH = MINIMUM_PANE_WIDTH * 2 + SEPARATOR_WIDTH

interface VerticalDiagramComparisonProps {
    currentDiagram: PositionedDiagramData
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    geometry?: DiagramGeometryService
    groupDrawing?: DiagramGroupDrawingService
    layoutService?: DiagramComparisonLayoutService
    movement?: DiagramMoveService
    onCurrentSelect: (anchorElement: HTMLElement, selection: DiagramSelection) => void
    placement?: DiagramNodePlacementService
    resize?: DiagramResizeService
    review?: DiagramChangeReviewService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

interface CurrentDiagramPaneProps {
    currentDiagram: PositionedDiagramData
    onCurrentSelect: (anchorElement: HTMLElement, selection: DiagramSelection) => void
}

interface NewDiagramPaneProps {
    details: DiagramObjectDetailsService
    drawing: DiagramEdgeDrawingService
    geometry: DiagramGeometryService
    groupDrawing: DiagramGroupDrawingService
    movement: DiagramMoveService
    placement: DiagramNodePlacementService
    resize: DiagramResizeService
    review: DiagramChangeReviewService
    selection: DiagramSelectionService
    session: DiagramEditSessionService
}

const CurrentDiagramPane = memo(function CurrentDiagramPane({ currentDiagram, onCurrentSelect }: CurrentDiagramPaneProps) {
    return (
        <Paper
            aria-label="Current"
            elevation={0}
            role="region"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, minWidth: 0, overflow: 'auto', p: 2 }}
        >
            <Typography color="custom.colHead" sx={{ mb: 1 }} variant="overline">Current</Typography>
            <DiagramRenderer data={currentDiagram} onSelect={onCurrentSelect} />
        </Paper>
    )
})

const NewDiagramPane = memo(function NewDiagramPane(props: NewDiagramPaneProps) {
    const {details, drawing, geometry, groupDrawing, movement} = props
    const {placement, resize, review, selection, session} = props
    return (
        <Paper
            aria-label="New"
            elevation={0}
            role="region"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
        >
            <Typography color="custom.colHead" sx={{ flexShrink: 0, px: 2, pt: 2 }} variant="overline">New</Typography>
            <DiagramNewPane
                details={details}
                drawing={drawing}
                geometry={geometry}
                groupDrawing={groupDrawing}
                movement={movement}
                placement={placement}
                resize={resize}
                review={review}
                selection={selection}
                session={session}
            />
        </Paper>
    )
})

function availablePaneWidth(containerWidth: number) {
    return Math.max(containerWidth - SEPARATOR_WIDTH, 0)
}

function clampLeftPaneWidth(proposedWidth: number, availableWidth: number) {
    const minimumWidth = Math.min(MINIMUM_PANE_WIDTH, availableWidth / 2)

    return Math.min(Math.max(proposedWidth, minimumWidth), availableWidth - minimumWidth)
}

function dividerRatioForWidth(proposedWidth: number, availableWidth: number) {
    if (availableWidth === 0) return 0.5

    return clampLeftPaneWidth(proposedWidth, availableWidth) / availableWidth
}

/** Side-by-side comparison layout. Diagram changes remain inside New service-bound leaves. */
export function VerticalDiagramComparison({
    currentDiagram,
    details = diagramObjectDetailsService,
    drawing = diagramEdgeDrawingService,
    geometry = diagramGeometryService,
    groupDrawing = diagramGroupDrawingService,
    layoutService = diagramComparisonLayoutService,
    movement = diagramMoveService,
    onCurrentSelect,
    placement = diagramNodePlacementService,
    resize = diagramResizeService,
    review = diagramChangeReviewService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: VerticalDiagramComparisonProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const activePointerIdRef = useRef<number | null>(null)
    const dividerRatio = useSyncExternalStore(
        layoutService.subscribeVerticalDivider,
        layoutService.getVerticalDividerSnapshot,
        layoutService.getVerticalDividerSnapshot,
    )

    const setDividerFromClientX = useCallback((clientX: number) => {
        const container = containerRef.current
        if (!container) return

        const bounds = container.getBoundingClientRect()
        const availableWidth = availablePaneWidth(bounds.width)
        layoutService.setVerticalDividerRatio(dividerRatioForWidth(clientX - bounds.left, availableWidth))
    }, [layoutService])

    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        activePointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }, [])

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        setDividerFromClientX(event.clientX)
    }, [setDividerFromClientX])

    const stopPointerResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        activePointerIdRef.current = null
        event.currentTarget.releasePointerCapture?.(event.pointerId)
    }, [])

    const handleSeparatorKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        const container = containerRef.current
        if (!container) return

        const availableWidth = availablePaneWidth(container.getBoundingClientRect().width)
        const currentWidth = dividerRatio * availableWidth
        const proposedWidthByKey: Record<string, number> = {
            ArrowLeft: currentWidth - KEYBOARD_RESIZE_STEP,
            ArrowRight: currentWidth + KEYBOARD_RESIZE_STEP,
            End: availableWidth,
            Home: 0,
        }
        const proposedWidth = proposedWidthByKey[event.key]
        if (proposedWidth === undefined) return

        event.preventDefault()
        layoutService.setVerticalDividerRatio(dividerRatioForWidth(proposedWidth, availableWidth))
    }, [dividerRatio, layoutService])

    return (
        <Box
            aria-label="Vertical diagram comparison"
            ref={containerRef}
            sx={{
                display: 'grid',
                flex: 1,
                gridTemplateColumns: `minmax(${MINIMUM_PANE_WIDTH}px, ${dividerRatio}fr) ${SEPARATOR_WIDTH}px minmax(${MINIMUM_PANE_WIDTH}px, ${1 - dividerRatio}fr)`,
                height: '100%',
                minWidth: MINIMUM_COMPARISON_WIDTH,
                overflow: 'hidden',
            }}
        >
            <CurrentDiagramPane currentDiagram={currentDiagram} onCurrentSelect={onCurrentSelect} />
            <Box
                aria-label="Resize Current and New diagrams horizontally"
                aria-orientation="vertical"
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
                    cursor: 'col-resize',
                    touchAction: 'none',
                    '&:focus-visible': { bgcolor: 'primary.main', outline: 'none' },
                    '&:hover': { bgcolor: 'primary.main' },
                }}
                tabIndex={0}
            />
            <NewDiagramPane
                details={details}
                drawing={drawing}
                geometry={geometry}
                groupDrawing={groupDrawing}
                movement={movement}
                placement={placement}
                resize={resize}
                review={review}
                selection={selection}
                session={session}
            />
        </Box>
    )
}
