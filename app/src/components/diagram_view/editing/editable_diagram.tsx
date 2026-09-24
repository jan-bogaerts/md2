import { Box } from '@mui/material'
import { useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../../services/diagrams/diagram_geometry_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../../services/diagrams/diagram_selection_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../../services/diagrams/diagram_node_placement_service'
import {
    diagramGroupDrawingService, type DiagramGroupDrawingService,
} from '../../../services/diagrams/diagram_group_drawing_service'
import {
    EditableDiagramActivations,
    EditableDiagramEdges,
    EditableDiagramFragments,
    EditableDiagramGroups,
    EditableDiagramLifelines,
    EditableDiagramNodes,
} from './editable_diagram_collections'
import { convertClientToDiagramCoordinates } from './diagram_coordinate_conversion'
import { DiagramSelectionRectangle } from './diagram_selection_rectangle'
import { DiagramResizeHandles } from './diagram_resize_handles'
import { DiagramObjectDetailsDialog } from '../details/diagram_object_details_dialog'
import { DiagramNodePlacementPreview } from './diagram_node_placement_preview'
import { DiagramEdgeDrawingPreview } from './diagram_edge_drawing_preview'
import { DiagramGroupDrawingPreview } from './diagram_group_drawing_preview'
import { DiagramGroupLabelDialog } from '../details/diagram_group_label_dialog'
import { DiagramFragmentDialog } from '../details/diagram_fragment_dialog'
import {
    diagramFragmentDialogService, type DiagramFragmentDialogService,
} from '../details/diagram_fragment_dialog_service'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../../services/diagrams/diagram_edge_drawing_service'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from '../details/diagram_object_details_service'
import { DIAGRAM_EDITOR_ROOT_ATTRIBUTE, useDeleteDiagramSelectionOnDeleteKey } from './use_diagram_delete_key'
import { useDiagramSurfaceField } from './use_diagram_geometry'
import { diagramViewService, type DiagramViewService } from '../../../services/diagrams/diagram_view_service'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../../services/diagrams/diagram_emphasis_service'
import { DiagramChangeReviewDialog } from '../review/diagram_change_review_dialog'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from '../review/diagram_change_review_service'
import { DiagramChangeActionPopup } from '../review/diagram_change_action_popup'
import { DiagramInlineMetadataField } from './diagram_inline_metadata_field'
import { useActiveDiagramTool } from './use_diagram_tool'

interface EditableDiagramProps {
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    emphasis?: DiagramEmphasisService
    fragmentDialog?: DiagramFragmentDialogService
    geometry?: DiagramGeometryService
    groupDrawing?: DiagramGroupDrawingService
    placement?: DiagramNodePlacementService
    review?: DiagramChangeReviewService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
    viewService?: DiagramViewService
}

interface MetadataLeafProps {
    session?: DiagramEditSessionService
}

/** Title of the New diagram; it observes that one metadata field. */
export function EditableDiagramTitle({ session = diagramEditSessionService }: MetadataLeafProps) {
    return <DiagramInlineMetadataField field="title" session={session} />
}

/** Description of the New diagram; it observes that one metadata field. */
export function EditableDiagramDescription({ session = diagramEditSessionService }: MetadataLeafProps) {
    return <DiagramInlineMetadataField field="description" session={session} />
}

/**
 * Sizes the New drawing surface. Its children arrive as an element through `children`, so a surface bound change
 * resizes the box without rerendering the collection hosts inside it.
 */
export function EditableDiagramSurface({
    children,
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
    viewService = diagramViewService,
}: {
    children: ReactNode,
    geometry?: DiagramGeometryService,
    selection?: DiagramSelectionService,
    session?: DiagramEditSessionService,
    viewService?: DiagramViewService,
}) {
    const height = useDiagramSurfaceField('height', geometry)
    const width = useDiagramSurfaceField('width', geometry)
    const activeTool = useActiveDiagramTool(session)
    const activePointerIdRef = useRef<number | null>(null)
    const suppressNextClickRef = useRef(false)
    const diagramPointFromPointer = (event: PointerEvent<HTMLDivElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        const viewportMetrics = { bounds: { left: bounds.left, top: bounds.top }, scrollLeft: 0, scrollTop: 0 }

        return convertClientToDiagramCoordinates(event, viewportMetrics, session.getViewportScaleSnapshot()).diagramPoint
    }
    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || session.getActiveToolSnapshot() !== 'select') return
        if ((event.target as Element).closest('[data-diagram-id], [data-diagram-resize-handle]')) return

        event.preventDefault()
        activePointerIdRef.current = event.pointerId
        suppressNextClickRef.current = false
        selection.beginRectangleSelection(diagramPointFromPointer(event))
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        selection.updateRectangleSelection(diagramPointFromPointer(event))
    }
    const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId)
        }
        activePointerIdRef.current = null
    }
    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        selection.completeRectangleSelection(diagramPointFromPointer(event))
        suppressNextClickRef.current = true
        releasePointer(event)
    }
    const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        selection.cancelRectangleSelection()
        releasePointer(event)
    }
    const handleClick = (event: MouseEvent<HTMLDivElement>) => {
        if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false

            return
        }
        if (session.getActiveToolSnapshot() !== 'select') return
        if ((event.target as Element).closest('[data-diagram-id], [data-diagram-resize-handle]')) return

        selection.clear()
    }
    const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
        const objectElement = (event.target as Element).closest<HTMLElement>('[data-diagram-id][data-diagram-kind]')
        const objectKind = objectElement?.dataset.diagramKind
        if (!objectElement || (objectKind !== 'edge' && objectKind !== 'node')) return
        event.preventDefault()
        const sessionSnapshot = session.getSessionSnapshot()
        const itemId = objectElement.dataset.diagramId
        const itemLabel = objectElement.getAttribute('aria-label')
        if (!sessionSnapshot || !itemId || !itemLabel) throw new Error('New diagram context target is missing identity or session')
        viewService.openItemMenu({
            anchorElement: event.currentTarget,
            diagramId: sessionSnapshot.sourceDiagramId,
            itemId,
            itemLabel,
            left: event.clientX,
            objectKind,
            surface: 'new',
            top: event.clientY,
        })
    }

    return (
        <Box
            aria-label="New diagram"
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            sx={{ height, position: 'relative', touchAction: activeTool === 'select' ? 'auto' : 'none', width }}
        >
            {children}
        </Box>
    )
}

/**
 * Root of the New diagram. It composes stable hosts and leaves and subscribes to no diagram state itself, so no
 * edit inside the diagram can rerender it.
 */
export function EditableDiagram({
    details = diagramObjectDetailsService,
    drawing = diagramEdgeDrawingService,
    emphasis = diagramEmphasisService,
    fragmentDialog = diagramFragmentDialogService,
    geometry = diagramGeometryService,
    groupDrawing = diagramGroupDrawingService,
    placement = diagramNodePlacementService,
    review = diagramChangeReviewService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
    viewService = diagramViewService,
}: EditableDiagramProps) {
    useDeleteDiagramSelectionOnDeleteKey(selection)

    return (
        <Box
            {...{ [DIAGRAM_EDITOR_ROOT_ATTRIBUTE]: 'true' }}
            aria-label="New diagram editor"
            sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
            tabIndex={-1}
        >
            <Box>
                <EditableDiagramTitle session={session} />
                <EditableDiagramDescription session={session} />
            </Box>
            <EditableDiagramSurface geometry={geometry} selection={selection} session={session} viewService={viewService}>
                <EditableDiagramGroups details={details} emphasis={emphasis} geometry={geometry} selection={selection} session={session} />
                <DiagramGroupDrawingPreview drawing={groupDrawing} />
                <EditableDiagramFragments emphasis={emphasis} fragmentDialog={fragmentDialog} geometry={geometry} session={session} />
                <EditableDiagramLifelines emphasis={emphasis} geometry={geometry} session={session} />
                <EditableDiagramActivations emphasis={emphasis} geometry={geometry} session={session} />
                <EditableDiagramEdges details={details} emphasis={emphasis} geometry={geometry} selection={selection} session={session} />
                <DiagramEdgeDrawingPreview drawing={drawing} />
                <EditableDiagramNodes details={details} emphasis={emphasis} geometry={geometry} selection={selection} session={session} />
                <DiagramNodePlacementPreview placement={placement} />
                <DiagramResizeHandles geometry={geometry} selection={selection} session={session} />
                <DiagramSelectionRectangle selection={selection} />
            </EditableDiagramSurface>
            <DiagramObjectDetailsDialog details={details} session={session} />
            <DiagramGroupLabelDialog drawing={groupDrawing} />
            <DiagramFragmentDialog dialog={fragmentDialog} session={session} />
            <DiagramChangeReviewDialog review={review} session={session} />
            <DiagramChangeActionPopup review={review} />
        </Box>
    )
}
