import { memo } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { PositionedSequenceFragment } from '../../services/diagrams/diagram_layout'
import { SequenceFragment } from './sequence_fragment'
import { useDiagramFragmentGeometryField } from './use_diagram_geometry'
import { useEditableDiagramFragmentField } from './use_editable_diagram'

interface EditableDiagramFragmentProps {
    fragmentId: string
    geometry?: DiagramGeometryService
    session?: DiagramEditSessionService
}

/** One sequence frame of the New diagram, bound to its own operator, box, divider, and guard positions. */
function EditableDiagramFragmentLeaf({
    fragmentId,
    geometry = diagramGeometryService,
    session = diagramEditSessionService,
}: EditableDiagramFragmentProps) {
    const operator = useEditableDiagramFragmentField(fragmentId, 'operator', session)
    const dividerY = useDiagramFragmentGeometryField(fragmentId, 'dividerY', geometry)
    const guardPositions = useDiagramFragmentGeometryField(fragmentId, 'guardPositions', geometry)
    const height = useDiagramFragmentGeometryField(fragmentId, 'height', geometry)
    const width = useDiagramFragmentGeometryField(fragmentId, 'width', geometry)
    const x = useDiagramFragmentGeometryField(fragmentId, 'x', geometry)
    const y = useDiagramFragmentGeometryField(fragmentId, 'y', geometry)
    if (!operator || typeof height !== 'number' || typeof width !== 'number') return null

    const fragment: PositionedSequenceFragment = {
        guardPositions: Array.isArray(guardPositions) ? [...guardPositions] : [],
        height,
        id: fragmentId,
        operator,
        width,
        x: typeof x === 'number' ? x : 0,
        y: typeof y === 'number' ? y : 0,
        ...(typeof dividerY === 'number' ? { dividerY } : {}),
    }

    return <SequenceFragment fragment={fragment} />
}

/** Memoised so a collection host rerender caused by another member cannot rerender this leaf. */
export const EditableDiagramFragment = memo(EditableDiagramFragmentLeaf)
