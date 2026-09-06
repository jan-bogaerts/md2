import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { EditableDiagramEntityField } from './editable_diagram_entity_field'
import { useEditableDiagramEntityFieldIndexes } from './use_editable_diagram'

interface EditableDiagramEntityFieldsProps {
    nodeId: string
    session: DiagramEditSessionService
}

/** Owns entity field-list membership while field leaves own their individual values. */
export function EditableDiagramEntityFields({ nodeId, session }: EditableDiagramEntityFieldsProps) {
    const fieldIndexes = useEditableDiagramEntityFieldIndexes(nodeId, session)

    return fieldIndexes?.map((fieldIndex) => (
        <EditableDiagramEntityField fieldIndex={fieldIndex} key={fieldIndex} nodeId={nodeId} session={session} />
    )) ?? null
}
