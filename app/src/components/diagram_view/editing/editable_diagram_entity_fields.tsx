import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramFontFormatting } from '../../../services/diagrams/diagram_data'
import { EditableDiagramEntityField } from './editable_diagram_entity_field'
import { useEditableDiagramEntityFieldIndexes } from './use_editable_diagram'

interface EditableDiagramEntityFieldsProps {
    fontFormatting?: DiagramFontFormatting
    fontScalePercent: number
    nodeId: string
    session: DiagramEditSessionService
}

/** Owns entity field-list membership while field leaves own their individual values. */
export function EditableDiagramEntityFields(props: EditableDiagramEntityFieldsProps) {
    const { fontFormatting, fontScalePercent, nodeId, session } = props
    const fieldIndexes = useEditableDiagramEntityFieldIndexes(nodeId, session)

    return fieldIndexes?.map((fieldIndex) => (
        <EditableDiagramEntityField
            fieldIndex={fieldIndex}
            fontFormatting={fontFormatting}
            fontScalePercent={fontScalePercent}
            key={fieldIndex}
            nodeId={nodeId}
            session={session}
        />
    )) ?? null
}
