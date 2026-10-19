import type { DiagramConnectionKindFormatting, DiagramEdgeKind, DiagramNodeRoleFormatting, DiagramRole } from './diagram_data'
import { diagramScale, sameFormattingValue, type DiagramScaleField, withConnectionKindFormatting, withDiagramScale, withNodeRoleFormatting } from './diagram_formatting'
import { DiagramEditContext } from './diagram_edit_context'
import { diagramFormattingCategoryChangedEvent, diagramFormattingScaleChangedEvent } from './diagram_edit_events'


/** Edits the session-owned canonical diagram. */
export class DiagramFormattingEditor {
    private readonly context: DiagramEditContext

    constructor(context: DiagramEditContext) { this.context = context }

    setFormattingScale(field: DiagramScaleField, value: number) {
        const diagram = this.context.diagram
        const previousValue = diagramScale(diagram.formatting, field)
        const formatting = withDiagramScale(diagram, field, value)
        if (previousValue === value) return

        diagram.formatting = formatting
        this.context.transaction.finishFormattingChange(
            diagramFormattingScaleChangedEvent(field), 'diagram', field,
            diagramScale(this.context.changeRegistry.baseline?.formatting, field), previousValue, value,
        )
    }

    setNodeRoleFormatting(role: DiagramRole, value: DiagramNodeRoleFormatting) {
        const diagram = this.context.diagram
        const previousValue = diagram.formatting?.nodeRoles?.[role]
        const formatting = withNodeRoleFormatting(diagram, role, value)
        const nextValue = formatting.nodeRoles?.[role]
        if (sameFormattingValue(previousValue, nextValue)) return

        diagram.formatting = formatting
        this.context.transaction.finishFormattingChange(
            diagramFormattingCategoryChangedEvent('nodeRole', role), role, 'nodeRole',
            this.context.changeRegistry.baseline?.formatting?.nodeRoles?.[role], previousValue, nextValue,
        )
    }

    setConnectionKindFormatting(kind: DiagramEdgeKind, value: DiagramConnectionKindFormatting) {
        const diagram = this.context.diagram
        const previousValue = diagram.formatting?.connectionKinds?.[kind]
        const formatting = withConnectionKindFormatting(diagram, kind, value)
        const nextValue = formatting.connectionKinds?.[kind]
        if (sameFormattingValue(previousValue, nextValue)) return

        diagram.formatting = formatting
        this.context.transaction.finishFormattingChange(
            diagramFormattingCategoryChangedEvent('connectionKind', kind), kind, 'connectionKind',
            this.context.changeRegistry.baseline?.formatting?.connectionKinds?.[kind], previousValue, nextValue,
        )
    }

}
