import { memo } from 'react'
import { Box } from '@mui/material'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import { useDiagramNodeGeometryField, useDiagramSurfaceField } from './use_diagram_geometry'
import { useEditableDiagramMetadataField } from './use_editable_diagram'

const LIFELINE_BOTTOM_MARGIN = 24

interface EditableDiagramLifelineProps {
    geometry?: DiagramGeometryService
    nodeId: string
    session?: DiagramEditSessionService
}

/** The dashed sequence lifeline under one participant of the New diagram. */
function EditableDiagramLifelineLeaf({
    geometry = diagramGeometryService,
    nodeId,
    session = diagramEditSessionService,
}: EditableDiagramLifelineProps) {
    const diagramType = useEditableDiagramMetadataField('type', session)
    const surfaceHeight = useDiagramSurfaceField('height', geometry)
    const height = useDiagramNodeGeometryField(nodeId, 'height', geometry)
    const width = useDiagramNodeGeometryField(nodeId, 'width', geometry)
    const x = useDiagramNodeGeometryField(nodeId, 'x', geometry)
    const y = useDiagramNodeGeometryField(nodeId, 'y', geometry)
    if (diagramType !== 'sequence' || height === null || width === null || x === null || y === null) return null

    return (
        <Box
            sx={{
                borderColor: 'divider', borderLeft: '1px dashed',
                height: surfaceHeight - LIFELINE_BOTTOM_MARGIN - y - height, left: x + width / 2,
                position: 'absolute', top: y + height, zIndex: 1,
            }}
        />
    )
}

/** Memoised so a collection host rerender caused by another member cannot rerender this leaf. */
export const EditableDiagramLifeline = memo(EditableDiagramLifelineLeaf)
