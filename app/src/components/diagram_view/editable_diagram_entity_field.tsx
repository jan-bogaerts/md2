import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramEntityFieldRow } from './diagram_entity_field'
import { useEditableDiagramEntityField } from './use_editable_diagram'

interface EditableDiagramEntityFieldProps {
    fieldIndex: number
    nodeId: string
    session: DiagramEditSessionService
}

/** Subscribes to one position-addressed entity field only. */
export function EditableDiagramEntityField({ fieldIndex, nodeId, session }: EditableDiagramEntityFieldProps) {
    const key = useEditableDiagramEntityField(nodeId, fieldIndex, 'key', session)
    const name = useEditableDiagramEntityField(nodeId, fieldIndex, 'name', session)
    const type = useEditableDiagramEntityField(nodeId, fieldIndex, 'type', session)
    if (name === null) return null

    const field = {
        ...(key ? { key } : {}),
        name,
        ...(type ? { type } : {}),
    }

    return <DiagramEntityFieldRow field={field} />
}
