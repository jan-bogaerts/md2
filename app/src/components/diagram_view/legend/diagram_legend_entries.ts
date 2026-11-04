import type { DiagramData, DiagramEdge, DiagramEdgeKind, DiagramLegendEntryData, DiagramNode, DiagramNodeKind, DiagramRole } from '../../../services/diagrams/diagram_data'
import { diagramEdgeKindLabel, diagramNodeKindLabel, effectiveDiagramNodeKind } from '../../../services/diagrams/diagram_creation_tool_labels'

export type DiagramLegendEntry =
    | { entryType: 'connection', id: string, kind: DiagramEdgeKind, label: string, useLabelAsDefault: boolean }
    | { entryType: 'node', id: string, label: string, role: DiagramRole }
    | { entryType: 'nodeKind', id: string, label: string, nodeKind: DiagramNodeKind, roles: readonly DiagramRole[] }

function derivedDiagramLegendEntries(data: {
    meta: Pick<DiagramData['meta'], 'type'>
    nodes: readonly Pick<DiagramNode, 'kind' | 'role'>[]
    edges: readonly Pick<DiagramEdge, 'kind'>[]
}): DiagramLegendEntry[] {
    const nodeKinds = [...new Set(data.nodes.map(({ kind }) => effectiveDiagramNodeKind(kind, data.meta.type)))]
    const nodeEntries = nodeKinds.map((nodeKind): DiagramLegendEntry => ({
        entryType: 'nodeKind', id: `nodeKind:${nodeKind}`, label: diagramNodeKindLabel(nodeKind), nodeKind,
        roles: [...new Set(data.nodes
            .filter(({ kind }) => effectiveDiagramNodeKind(kind, data.meta.type) === nodeKind)
            .map(({ role }) => role))],
    }))
    const edgeKinds = [...new Set(data.edges.map(({ kind }) => kind))]
    const connectionEntries = edgeKinds.map((kind): DiagramLegendEntry => ({entryType: 'connection', id: `connection:${kind}`, kind, label: diagramEdgeKindLabel(kind), useLabelAsDefault: false}))

    return [...nodeEntries, ...connectionEntries]
}

/** Uses explicit legend entries when the diagram carries them, and derives entries only when it has none. */
export function diagramLegendEntries(data: {
    meta: Pick<DiagramData['meta'], 'legend' | 'type'>
    nodes: readonly Pick<DiagramNode, 'kind' | 'legendEntryId' | 'role'>[]
    edges: readonly Pick<DiagramEdge, 'kind' | 'legendEntryId'>[]
}): DiagramLegendEntry[] {
    const entries = data.meta.legend
    if (!entries || entries.length === 0) return derivedDiagramLegendEntries(data)

    return entries.map((entry: DiagramLegendEntryData): DiagramLegendEntry => {
        if ('role' in entry) return { entryType: 'node', id: entry.id, label: entry.label, role: entry.role }
        if ('kind' in entry) return {
            entryType: 'connection', id: entry.id, kind: entry.kind, label: entry.label,
            useLabelAsDefault: entry.useLabelAsDefault,
        }
        const roles = [...new Set(data.nodes
            .filter(({ kind, legendEntryId }) => (
                legendEntryId === entry.id && effectiveDiagramNodeKind(kind, data.meta.type) === entry.nodeKind
            ))
            .map(({ role }) => role))]

        return { entryType: 'nodeKind', id: entry.id, label: entry.label, nodeKind: entry.nodeKind, roles }
    })
}
