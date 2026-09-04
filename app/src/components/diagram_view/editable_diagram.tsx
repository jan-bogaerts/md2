import { Box, Typography } from '@mui/material'
import type { MouseEvent, ReactNode } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import {
    EditableDiagramActivations,
    EditableDiagramEdges,
    EditableDiagramFragments,
    EditableDiagramGroups,
    EditableDiagramLifelines,
    EditableDiagramNodes,
} from './editable_diagram_collections'
import { useDiagramSurfaceField } from './use_diagram_geometry'
import { useEditableDiagramMetadataField } from './use_editable_diagram'

interface EditableDiagramProps {
    geometry?: DiagramGeometryService
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
    const handleClick = (event: MouseEvent<HTMLDivElement>) => {
        if (session.getActiveToolSnapshot() !== 'select') return
        if ((event.target as Element).closest('[data-diagram-id]')) return

        selection.clear()
    }

    return (
        <Box aria-label="New diagram" onClick={handleClick} sx={{ height, position: 'relative', width }}>{children}</Box>
    )
}

/**
 * Root of the New diagram. It composes stable hosts and leaves and subscribes to no diagram state itself, so no
 * edit inside the diagram can rerender it.
 */
export function EditableDiagram({
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: EditableDiagramProps) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
                <EditableDiagramTitle session={session} />
                <EditableDiagramDescription session={session} />
            </Box>
            <EditableDiagramSurface geometry={geometry} selection={selection} session={session}>
                <EditableDiagramGroups geometry={geometry} selection={selection} session={session} />
                <EditableDiagramFragments geometry={geometry} session={session} />
                <EditableDiagramLifelines geometry={geometry} session={session} />
                <EditableDiagramActivations geometry={geometry} session={session} />
                <EditableDiagramEdges geometry={geometry} selection={selection} session={session} />
                <EditableDiagramNodes geometry={geometry} selection={selection} session={session} />
            </EditableDiagramSurface>
        </Box>
    )
}
