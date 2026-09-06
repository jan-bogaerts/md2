import { Box } from '@mui/material'
import { useState } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import {
    diagramGroupDrawingService, type DiagramGroupDrawingService,
} from '../../services/diagrams/diagram_group_drawing_service'
import { diagramMoveService, type DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service'
import { diagramResizeService, type DiagramResizeService } from '../../services/diagrams/diagram_resize_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import { DiagramToolbox } from './diagram_toolbox'
import { DiagramZoomViewport } from './diagram_zoom_viewport'

interface DiagramNewPaneProps {
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    geometry?: DiagramGeometryService
    groupDrawing?: DiagramGroupDrawingService
    movement?: DiagramMoveService
    placement?: DiagramNodePlacementService
    resize?: DiagramResizeService
    review?: DiagramChangeReviewService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
    toolboxVisible?: boolean
}

/** Owns New viewport and its floating tools so every comparison mode exposes one complete editor. */
export function DiagramNewPane({
    details = diagramObjectDetailsService,
    drawing = diagramEdgeDrawingService,
    geometry = diagramGeometryService,
    groupDrawing = diagramGroupDrawingService,
    movement = diagramMoveService,
    placement = diagramNodePlacementService,
    resize = diagramResizeService,
    review = diagramChangeReviewService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
    toolboxVisible = true,
}: DiagramNewPaneProps) {
    const [boundaryElement, setBoundaryElement] = useState<HTMLDivElement | null>(null)

    return (
        <Box ref={setBoundaryElement} sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
            <DiagramZoomViewport
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
            {toolboxVisible ? (
                <DiagramToolbox
                    boundaryElement={boundaryElement}
                    details={details}
                    drawing={drawing}
                    groupDrawing={groupDrawing}
                    placement={placement}
                    review={review}
                    session={session}
                />
            ) : null}
        </Box>
    )
}
