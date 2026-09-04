import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramSelectHandler } from './diagram_selection'
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
    onSelect?: DiagramSelectHandler
    session?: DiagramEditSessionService
}

interface MetadataLeafProps {
    session?: DiagramEditSessionService
}

const ignoreSelection: DiagramSelectHandler = () => undefined

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
export function EditableDiagramSurface({ children, geometry = diagramGeometryService }: {
    children: ReactNode,
    geometry?: DiagramGeometryService,
}) {
    const height = useDiagramSurfaceField('height', geometry)
    const width = useDiagramSurfaceField('width', geometry)

    return (
        <Box aria-label="New diagram" sx={{ height, position: 'relative', width }}>{children}</Box>
    )
}

/**
 * Root of the New diagram. It composes stable hosts and leaves and subscribes to no diagram state itself, so no
 * edit inside the diagram can rerender it.
 */
export function EditableDiagram({
    geometry = diagramGeometryService,
    onSelect = ignoreSelection,
    session = diagramEditSessionService,
}: EditableDiagramProps) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
                <EditableDiagramTitle session={session} />
                <EditableDiagramDescription session={session} />
            </Box>
            <EditableDiagramSurface geometry={geometry}>
                <EditableDiagramGroups geometry={geometry} session={session} />
                <EditableDiagramFragments geometry={geometry} session={session} />
                <EditableDiagramLifelines geometry={geometry} session={session} />
                <EditableDiagramActivations geometry={geometry} session={session} />
                <EditableDiagramEdges geometry={geometry} onSelect={onSelect} session={session} />
                <EditableDiagramNodes geometry={geometry} onSelect={onSelect} session={session} />
            </EditableDiagramSurface>
        </Box>
    )
}
