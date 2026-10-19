import type { DiagramEntityField } from './diagram_data'
import { DiagramEditContext } from './diagram_edit_context'
import { diagramEntityFieldChangedEvent } from './diagram_edit_events'
import { invalidDiagramField, requireEntityFieldValue } from './diagram_edit_validation'
import type { MutableDiagramEntityField } from './diagram_edit_types'


/** Edits the session-owned canonical diagram. */
export class DiagramEntityFieldEditor {
    private readonly context: DiagramEditContext

    constructor(context: DiagramEditContext) { this.context = context }

    setEntityField<Field extends MutableDiagramEntityField>(
        nodeId: string,
        fieldIndex: number,
        field: Field,
        value: DiagramEntityField[Field],
    ) {
        const entityField = this.requireEntityField(nodeId, fieldIndex)
        const previousValue = entityField[field]
        if (Object.is(previousValue, value)) return false
        if (!this.context.validateOperation('Set entity field', () => {
            const diagram = this.context.diagram
            if (diagram.meta.type !== 'entity') {
                invalidDiagramField(`nodes.${nodeId}.fields`, 'value only allowed for entity diagrams')
            }
            requireEntityFieldValue(field, value, `nodes.${nodeId}.fields[${fieldIndex}].${field}`)
        })) return false

        entityField[field] = value
        const originalValue = this.context.changeRegistry.originalNodes.get(nodeId)?.fields?.[fieldIndex]?.[field]
        const objectId = `${nodeId}[${fieldIndex}]`
        const eventName = diagramEntityFieldChangedEvent(nodeId, fieldIndex, field)
        this.context.transaction.finishFieldChange(
            eventName,
            `node:${nodeId}`,
            'entityField',
            objectId,
            field,
            originalValue,
            previousValue,
            value,
        )

        return true
    }

    /** Adds one position-addressed field without replacing its owning field array. */
    addEntityField(nodeId: string, field: DiagramEntityField, fieldIndex?: number) {
        const node = this.requireEntityNode(nodeId)
        const fields = node.fields ?? []
        const index = fieldIndex ?? fields.length
        if (!this.context.validateOperation('Add entity field', () => {
            if (!Number.isInteger(index) || index < 0 || index > fields.length) {
                invalidDiagramField(`nodes.${nodeId}.fields`, `invalid insertion index ${index}`)
            }
            requireEntityFieldValue('key', field.key, `nodes.${nodeId}.fields[${index}].key`)
            requireEntityFieldValue('name', field.name, `nodes.${nodeId}.fields[${index}].name`)
            requireEntityFieldValue('type', field.type, `nodes.${nodeId}.fields[${index}].type`)
        })) return false

        if (!node.fields) node.fields = fields
        fields.splice(index, 0, { ...field })
        this.context.transaction.finishEntityFieldMembershipChange(nodeId, [index], [])

        return true
    }

    /** Removes one position-addressed field without replacing its owning field array. */
    removeEntityField(nodeId: string, fieldIndex: number) {
        const node = this.requireEntityNode(nodeId)
        const fields = node.fields ?? []
        if (!fields[fieldIndex]) return false

        fields.splice(fieldIndex, 1)
        this.context.transaction.finishEntityFieldMembershipChange(nodeId, [], [fieldIndex])

        return true
    }

    /** Reorders one position-addressed field within its owning array. */
    moveEntityField(nodeId: string, fieldIndex: number, targetIndex: number) {
        const node = this.requireEntityNode(nodeId)
        const fields = node.fields ?? []
        const field = fields[fieldIndex]
        if (!field || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= fields.length) return false
        if (fieldIndex === targetIndex) return false

        fields.splice(fieldIndex, 1)
        fields.splice(targetIndex, 0, field)
        this.context.transaction.finishEntityFieldMembershipChange(nodeId, [targetIndex], [fieldIndex])

        return true
    }

    private requireEntityField(nodeId: string, fieldIndex: number) {
        const node = this.context.getNode(nodeId)
        const entityField = node.fields?.[fieldIndex]
        if (!entityField) throw new Error(`Diagram entity field ${nodeId}[${fieldIndex}] does not exist`)

        return entityField
    }

    private requireEntityNode(nodeId: string) {
        const node = this.context.getNode(nodeId)
        const diagram = this.context.diagram
        if (diagram.meta.type !== 'entity') throw new Error(`Diagram node ${nodeId} does not belong to an entity diagram`)

        return node
    }

}
