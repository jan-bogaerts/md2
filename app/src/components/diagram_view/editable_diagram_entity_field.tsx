import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramFontFormatting } from '../../services/diagrams/diagram_data'
import { DiagramEntityFieldRow } from './diagram_entity_field'
import { useEditableDiagramEntityField } from './use_editable_diagram'

interface EditableDiagramEntityFieldProps {
    fieldIndex: number
    fontFormatting?: DiagramFontFormatting
    fontScalePercent: number
    nodeId: string
    session: DiagramEditSessionService
}

/** Subscribes to one position-addressed entity field only. */
export function EditableDiagramEntityField(props: EditableDiagramEntityFieldProps) {
    const { fieldIndex, fontFormatting, fontScalePercent, nodeId, session } = props
    const key = useEditableDiagramEntityField(nodeId, fieldIndex, 'key', session)
    const name = useEditableDiagramEntityField(nodeId, fieldIndex, 'name', session)
    const type = useEditableDiagramEntityField(nodeId, fieldIndex, 'type', session)
    if (name === null) return null

    const field = {
        ...(key ? { key } : {}),
        name,
        ...(type ? { type } : {}),
    }

    return <DiagramEntityFieldRow field={field} fontFormatting={fontFormatting} fontScalePercent={fontScalePercent} />
}
