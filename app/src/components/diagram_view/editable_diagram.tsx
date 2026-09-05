import { Box, Typography } from '@mui/material'
import { useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service'
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
import { DiagramObjectDetailsDialog } from './diagram_object_details_dialog'
import { DiagramNodePlacementPreview } from './diagram_node_placement_preview'
import { DiagramEdgeDrawingPreview } from './diagram_edge_drawing_preview'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import { DIAGRAM_EDITOR_ROOT_ATTRIBUTE, useDeleteDiagramSelectionOnDeleteKey } from './use_diagram_delete_key'
import { useDiagramSurfaceField } from './use_diagram_geometry'
import { useEditableDiagramMetadataField } from './use_editable_diagram'

interface EditableDiagramProps {
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    geometry?: DiagramGeometryService
    placement?: DiagramNodePlacementService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

interface MetadataLeafProps {
    session?: DiagramEditSessionService
}

/** Title of the New diagram; it observes that one metadata field. */
export function EditableDiagramTitle({ session = diagramEditSessionService }: MetadataLeafProps) {
    return <Typography variant="h6">{useEditableDiagramMetadataField('title', session) ?? ''}</Typography>
}

/** Description of the New diagram; it observes that one metadata field. */
export function EditableDiagramDescription({ session = diagramEditSessionService }: MetadataLeafProps) {
    return (
        <Typography color="text.secondary" variant="body2">
            {useEditableDiagramMetadataField('description', session) ?? ''}
        </Typography>
    )
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
}: {
    children: ReactNode,
    geometry?: DiagramGeometryService,
    selection?: DiagramSelectionService,
    session?: DiagramEditSessionService,
}) {
    const height = useDiagramSurfaceField('height', geometry)
    const width = useDiagramSurfaceField('width', geometry)
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

    return (
        <Box
            aria-label="New diagram"
            onClick={handleClick}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            sx={{ height, position: 'relative', touchAction: 'none', width }}
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
    geometry = diagramGeometryService,
    placement = diagramNodePlacementService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: EditableDiagramProps) {
    useDeleteDiagramSelectionOnDeleteKey(selection)

    return (
        <Box
            {...{ [DIAGRAM_EDITOR_ROOT_ATTRIBUTE]: 'true' }}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
            <Box>
                <EditableDiagramTitle session={session} />
                <EditableDiagramDescription session={session} />
            </Box>
            <EditableDiagramSurface geometry={geometry} selection={selection} session={session}>
                <EditableDiagramGroups details={details} geometry={geometry} selection={selection} session={session} />
                <EditableDiagramFragments geometry={geometry} session={session} />
                <EditableDiagramLifelines geometry={geometry} session={session} />
                <EditableDiagramActivations geometry={geometry} session={session} />
                <EditableDiagramEdges details={details} geometry={geometry} selection={selection} session={session} />
                <DiagramEdgeDrawingPreview drawing={drawing} />
                <EditableDiagramNodes details={details} geometry={geometry} selection={selection} session={session} />
                <DiagramNodePlacementPreview placement={placement} />
                <DiagramResizeHandles geometry={geometry} selection={selection} session={session} />
                <DiagramSelectionRectangle selection={selection} />
            </EditableDiagramSurface>
            <DiagramObjectDetailsDialog details={details} session={session} />
        </Box>
    )
}
