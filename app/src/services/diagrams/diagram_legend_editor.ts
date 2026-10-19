import { requireDiagramString, type DiagramLegendEntryData } from './diagram_data'
import { diagramNodeKindLabel } from './diagram_creation_tool_labels'
import { derivedDiagramLegendEntries } from './diagram_derived_legend'
import { DiagramEditContext } from './diagram_edit_context'
import { diagramLegendEntryFieldChangedEvent, diagramLegendMembershipChangedEvent } from './diagram_edit_events'
import type { DiagramLegendMembershipChangeDetail, NewDiagramLegendEntry } from './diagram_edit_types'
import { invalidDiagramField, validateNewLegendEntry } from './diagram_edit_validation'
import { diagramLegendEntryKey } from './diagram_legend_entry_key'

const EMPTY_IDS: readonly string[] = Object.freeze([])

function canonicalLegendLabel(entry: NewDiagramLegendEntry) {
    return entry.label?.trim() || ('role' in entry ? entry.role
        : 'nodeKind' in entry ? diagramNodeKindLabel(entry.nodeKind) : entry.kind)
}

/** Edits the session-owned canonical diagram. */
export class DiagramLegendEditor {
    private readonly context: DiagramEditContext

    constructor(context: DiagramEditContext) { this.context = context }

    /** Turns displayed semantic categories into editable legend entries. */
    materializeDerivedLegend() {
        const diagram = this.context.diagram
        if (diagram.meta.legend !== undefined) return false

        const entries = derivedDiagramLegendEntries(diagram)
        diagram.meta.legend = entries
        this.context.transaction.finishLegendMembershipChange(entries.map(diagramLegendEntryKey), [])

        return true
    }

    /** Appends one explicit legend entry. */
    addLegendEntry(entry: NewDiagramLegendEntry) {
        const diagram = this.context.diagram
        const wasDerived = diagram.meta.legend === undefined
        const existingEntries = diagram.meta.legend ?? derivedDiagramLegendEntries(diagram)
        if (!this.context.validateOperation('Add legend entry', () => {
            validateNewLegendEntry(entry, diagram.meta.type, diagram.meta.preset)
            const entryKey = diagramLegendEntryKey(entry as DiagramLegendEntryData)
            if (existingEntries.some((existingEntry) => diagramLegendEntryKey(existingEntry) === entryKey)) {
                invalidDiagramField('meta.legend', `duplicate entry for ${entryKey}`)
            }
        })) return null

        const label = canonicalLegendLabel(entry)
        const added = ('role' in entry ? { label, role: entry.role }
            : 'nodeKind' in entry ? { label, nodeKind: entry.nodeKind }
                : { kind: entry.kind, label }) as DiagramLegendEntryData
        const entryKey = diagramLegendEntryKey(added)
        diagram.meta.legend = [...existingEntries, added]
        const addedKeys = !wasDerived ? [entryKey] : [
            ...existingEntries.map(diagramLegendEntryKey), entryKey,
        ]
        this.context.transaction.finishLegendMembershipChange(addedKeys, [])

        return entryKey
    }

    /** Removes one legend entry. Nodes and edges keep their own role and kind fields. */
    removeLegendEntry(entryKey: string) {
        const diagram = this.context.diagram
        if (!this.context.legendEntryKeys.includes(entryKey)) return false

        const legend = (diagram.meta.legend ?? []).filter((entry) => diagramLegendEntryKey(entry) !== entryKey)
        diagram.meta.legend = legend
        this.context.transaction.finishLegendMembershipChange([], [entryKey])

        return true
    }

    setLegendEntryLabel(entryKey: string, label: string) {
        const entry = this.requireLegendEntry(entryKey)
        const previousValue = entry.label
        const trimmedValue = label.trim()
        if (Object.is(previousValue, trimmedValue)) return false
        if (!this.context.validateOperation(
            'Set legend entry label',
            () => requireDiagramString(trimmedValue, `meta.legend.${entryKey}.label`),
        )) return false

        entry.label = trimmedValue
        const originalValue = this.findBaselineLegendEntry(entryKey)?.label
        const eventName = diagramLegendEntryFieldChangedEvent(entryKey, 'label')
        this.context.transaction.finishFieldChange(
            eventName, `legendEntry:${entryKey}`, 'legendEntry', entryKey, 'label', originalValue, previousValue, trimmedValue,
        )

        return true
    }

    /** Moves one entry to a new position, changing only legend membership order. */
    moveLegendEntry(entryKey: string, targetIndex: number) {
        const diagram = this.context.diagram
        const legend = [...diagram.meta.legend ?? []]
        const sourceIndex = legend.findIndex((entry) => diagramLegendEntryKey(entry) === entryKey)
        if (sourceIndex < 0) throw new Error(`Diagram legend entry ${entryKey} does not exist`)
        if (!this.context.validateOperation('Move legend entry', () => {
            if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= legend.length) {
                invalidDiagramField('meta.legend', `index ${targetIndex} outside the legend`)
            }
        })) return false
        if (sourceIndex === targetIndex) return false

        const [moved] = legend.splice(sourceIndex, 1)
        legend.splice(targetIndex, 0, moved)
        diagram.meta.legend = legend
        this.context.setLegendEntryKeys(Object.freeze(legend.map(diagramLegendEntryKey)))
        this.context.changeRegistry.markLegendOrderChanges()
        this.context.transaction.commit([])
        const detail: DiagramLegendMembershipChangeDetail = { addedKeys: EMPTY_IDS, removedKeys: EMPTY_IDS }
        this.context.target.dispatchEvent(new CustomEvent<DiagramLegendMembershipChangeDetail>(
            diagramLegendMembershipChangedEvent(),
            { detail },
        ))

        return true
    }

    private findBaselineLegendEntry(entryKey: string) {
        return this.context.changeRegistry.baseline?.meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey) ?? null
    }

    private requireLegendEntry(entryKey: string) {
        const diagram = this.context.diagram
        const entry = diagram.meta.legend?.find((candidate) => diagramLegendEntryKey(candidate) === entryKey) ?? null
        if (!entry) throw new Error(`Diagram legend entry ${entryKey} does not exist`)

        return entry
    }

}
