import type { DiagramData, DiagramEdge, DiagramLegendEntryData, DiagramNode } from './diagram_data'
import { effectiveDiagramNodeKind } from './diagram_creation_tool_labels'

export function nodeLegendEntryIsCompatible(
    entry: DiagramLegendEntryData,
    node: Pick<DiagramNode, 'kind' | 'role'>,
    diagramType: DiagramData['meta']['type'],
) {
    if ('role' in entry) return entry.role === node.role
    if ('nodeKind' in entry) return entry.nodeKind === effectiveDiagramNodeKind(node.kind, diagramType)

    return false
}

export function edgeLegendEntryIsCompatible(
    entry: DiagramLegendEntryData,
    edge: Pick<DiagramEdge, 'kind'>,
) {
    return 'kind' in entry && entry.kind === edge.kind
}

export function findCompatibleNodeLegendEntry(
    entries: readonly DiagramLegendEntryData[],
    node: Pick<DiagramNode, 'kind' | 'role'>,
    diagramType: DiagramData['meta']['type'],
) {
    return entries.find((entry) => nodeLegendEntryIsCompatible(entry, node, diagramType)) ?? null
}

export function findCompatibleEdgeLegendEntry(
    entries: readonly DiagramLegendEntryData[],
    edge: Pick<DiagramEdge, 'kind'>,
) {
    return entries.find((entry) => edgeLegendEntryIsCompatible(entry, edge)) ?? null
}
