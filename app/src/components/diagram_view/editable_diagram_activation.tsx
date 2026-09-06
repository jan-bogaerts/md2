import { memo } from 'react'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import { SequenceActivation } from './sequence_activation'
import { useDiagramActivationField } from './use_diagram_geometry'

interface EditableDiagramActivationProps {
    activationId: string
    geometry?: DiagramGeometryService
}

/** One activation bar of the New diagram; activations exist only as derived geometry. */
function EditableDiagramActivationLeaf({
    activationId,
    geometry = diagramGeometryService,
}: EditableDiagramActivationProps) {
    const height = useDiagramActivationField(activationId, 'height', geometry)
    const width = useDiagramActivationField(activationId, 'width', geometry)
    const x = useDiagramActivationField(activationId, 'x', geometry)
    const y = useDiagramActivationField(activationId, 'y', geometry)
    if (height === null || width === null) return null

    return <SequenceActivation activation={{ height, id: activationId, width, x: x ?? 0, y: y ?? 0 }} />
}

/** Memoised so a collection host rerender caused by another member cannot rerender this leaf. */
export const EditableDiagramActivation = memo(EditableDiagramActivationLeaf)
