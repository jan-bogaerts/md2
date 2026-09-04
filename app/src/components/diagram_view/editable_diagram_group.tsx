import { memo } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { PositionedDiagramGroup } from '../../services/diagrams/diagram_layout'
import { DiagramGroup } from './diagram_group'
import { useDiagramGroupGeometryField } from './use_diagram_geometry'
import { useEditableDiagramGroupField } from './use_editable_diagram'

interface EditableDiagramGroupProps {
    geometry?: DiagramGeometryService
    groupId: string
    session?: DiagramEditSessionService
}

/** One containment box of the New diagram, bound to its own label and its own derived box. */
function EditableDiagramGroupLeaf({
    geometry = diagramGeometryService,
    groupId,
    session = diagramEditSessionService,
}: EditableDiagramGroupProps) {
    const label = useEditableDiagramGroupField(groupId, 'label', session)
    const height = useDiagramGroupGeometryField(groupId, 'height', geometry)
    const width = useDiagramGroupGeometryField(groupId, 'width', geometry)
    const x = useDiagramGroupGeometryField(groupId, 'x', geometry)
    const y = useDiagramGroupGeometryField(groupId, 'y', geometry)
    if (label === null || height === null || width === null) return null

    // Membership is edited elsewhere and is not rendered by the box, so this view object carries no member IDs.
    const group: PositionedDiagramGroup = { height, id: groupId, label, nodeIds: [], width, x: x ?? 0, y: y ?? 0 }

    return <DiagramGroup group={group} />
}

/** Memoised so a collection host rerender caused by another member cannot rerender this leaf. */
export const EditableDiagramGroup = memo(EditableDiagramGroupLeaf)
