import { memo } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import { useDiagramNodeGeometryField, useDiagramSurfaceField } from './use_diagram_geometry'
import { useEditableDiagramMetadataField } from './use_editable_diagram'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../services/diagrams/diagram_emphasis_service'
import { SequenceLifeline } from './sequence_lifeline'

const LIFELINE_BOTTOM_MARGIN = 24

interface EditableDiagramLifelineProps {
    emphasis?: DiagramEmphasisService
    geometry?: DiagramGeometryService
    nodeId: string
    session?: DiagramEditSessionService
}

/** The dashed sequence lifeline under one participant of the New diagram. */
function EditableDiagramLifelineLeaf({
    emphasis = diagramEmphasisService,
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
        <SequenceLifeline
            emphasis={emphasis}
            emphasisSurface="new"
            height={surfaceHeight - LIFELINE_BOTTOM_MARGIN - y - height}
            nodeId={nodeId}
            x={x + width / 2}
            y={y + height}
        />
    )
}

/** Memoised so a collection host rerender caused by another member cannot rerender this leaf. */
export const EditableDiagramLifeline = memo(EditableDiagramLifelineLeaf)
