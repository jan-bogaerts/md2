import { Box } from '@mui/material'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../../services/diagrams/diagram_edge_drawing_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../../services/diagrams/diagram_geometry_service'
import {
    diagramGroupDrawingService, type DiagramGroupDrawingService,
} from '../../../services/diagrams/diagram_group_drawing_service'
import { diagramMoveService, type DiagramMoveService } from '../../../services/diagrams/diagram_move_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../../services/diagrams/diagram_node_placement_service'
import { diagramResizeService, type DiagramResizeService } from '../../../services/diagrams/diagram_resize_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../../services/diagrams/diagram_selection_service'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from '../review/diagram_change_review_service'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from '../details/diagram_object_details_service'
import { DiagramZoomViewport } from './diagram_zoom_viewport'
import { DiagramZoomSlider } from './diagram_zoom_slider'
import { diagramViewService, type DiagramViewService } from '../../../services/diagrams/diagram_view_service'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../../services/diagrams/diagram_emphasis_service'
import { DiagramEmphasisExitButton } from './diagram_emphasis_exit_button'

interface DiagramNewPaneProps {
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    emphasis?: DiagramEmphasisService
    geometry?: DiagramGeometryService
    groupDrawing?: DiagramGroupDrawingService
    movement?: DiagramMoveService
    placement?: DiagramNodePlacementService
    resize?: DiagramResizeService
    review?: DiagramChangeReviewService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
    viewService?: DiagramViewService
}

/** Owns New viewport and its floating tools so every comparison mode exposes one complete editor. */
export function DiagramNewPane({
    details = diagramObjectDetailsService,
    drawing = diagramEdgeDrawingService,
    emphasis = diagramEmphasisService,
    geometry = diagramGeometryService,
    groupDrawing = diagramGroupDrawingService,
    movement = diagramMoveService,
    placement = diagramNodePlacementService,
    resize = diagramResizeService,
    review = diagramChangeReviewService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
    viewService = diagramViewService,
}: DiagramNewPaneProps) {
    return (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
            <DiagramZoomViewport
                details={details}
                drawing={drawing}
                emphasis={emphasis}
                geometry={geometry}
                groupDrawing={groupDrawing}
                movement={movement}
                placement={placement}
                resize={resize}
                review={review}
                selection={selection}
                session={session}
                viewService={viewService}
            />
            <DiagramZoomSlider diagramIdentity="New" store={session} />
            <DiagramEmphasisExitButton emphasis={emphasis} surface="new" />
        </Box>
    )
}
