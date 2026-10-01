import type { DiagramData, DiagramEdge, DiagramLegendEntryData, DiagramNode } from './diagram_data'
import { diagramEdgeKindLabel, diagramNodeKindLabel, effectiveDiagramNodeKind } from './diagram_creation_tool_labels'

/** Derives distinct node kinds and connection kinds in first-appearance order. */
export function derivedDiagramLegendEntries(data: {
    meta: Pick<DiagramData['meta'], 'type'>
    nodes: readonly Pick<DiagramNode, 'kind' | 'role'>[]
    edges: readonly Pick<DiagramEdge, 'kind'>[]
}): DiagramLegendEntryData[] {
    const nodeKinds = [...new Set(data.nodes.map(({ kind }) => effectiveDiagramNodeKind(kind, data.meta.type)))]
    const edgeKinds = [...new Set(data.edges.map(({ kind }) => kind))]

    return [
        ...nodeKinds.map((nodeKind) => ({ label: diagramNodeKindLabel(nodeKind), nodeKind })),
        ...edgeKinds.map((kind) => ({ kind, label: diagramEdgeKindLabel(kind) })),
    ]
}
