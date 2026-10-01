import type { DiagramData, DiagramEdge, DiagramEdgeKind, DiagramLegendEntryData, DiagramNode, DiagramNodeKind, DiagramRole } from '../../../services/diagrams/diagram_data'
import { effectiveDiagramNodeKind } from '../../../services/diagrams/diagram_creation_tool_labels'
import { derivedDiagramLegendEntries } from '../../../services/diagrams/diagram_derived_legend'

export type DiagramLegendEntry =
    | { entryType: 'connection', kind: DiagramEdgeKind, label: string }
    | { entryType: 'node', label: string, role: DiagramRole }
    | { entryType: 'nodeKind', label: string, nodeKind: DiagramNodeKind, roles: readonly DiagramRole[] }

/** Uses explicit legend entries when the diagram carries them, and derives entries only when it has none. */
export function diagramLegendEntries(data: {
    meta: Pick<DiagramData['meta'], 'legend' | 'type'>
    nodes: readonly Pick<DiagramNode, 'kind' | 'role'>[]
    edges: readonly Pick<DiagramEdge, 'kind'>[]
}): DiagramLegendEntry[] {
    const entries = data.meta.legend ?? derivedDiagramLegendEntries(data)

    return entries.map((entry: DiagramLegendEntryData): DiagramLegendEntry => {
        if ('role' in entry) return { entryType: 'node', label: entry.label, role: entry.role }
        if ('kind' in entry) return { entryType: 'connection', kind: entry.kind, label: entry.label }
        const roles = [...new Set(data.nodes
            .filter(({ kind }) => effectiveDiagramNodeKind(kind, data.meta.type) === entry.nodeKind)
            .map(({ role }) => role))]

        return { entryType: 'nodeKind', label: entry.label, nodeKind: entry.nodeKind, roles }
    })
}
