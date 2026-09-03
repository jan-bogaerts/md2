import type { DiagramEdgeKind, DiagramRole } from '../../services/diagrams/diagram_data'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'

export type DiagramLegendEntry =
    | { entryType: 'connection', kind: DiagramEdgeKind, label: DiagramEdgeKind }
    | { entryType: 'node', label: DiagramRole, role: DiagramRole }

/** Derives unique node roles followed by connection kinds, preserving source order within each group. */
export function diagramLegendEntries(data: PositionedDiagramData): DiagramLegendEntry[] {
    const roles = [...new Set(data.nodes.map(({ role }) => role))]
    const kinds = [...new Set(data.edges.map(({ kind }) => kind))]

    return [
        ...roles.map((role): DiagramLegendEntry => ({ entryType: 'node', label: role, role })),
        ...kinds.map((kind): DiagramLegendEntry => ({ entryType: 'connection', kind, label: kind })),
    ]
}
