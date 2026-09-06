import type { DiagramEdgeKind, DiagramLegendEntryData, DiagramRole } from '../../services/diagrams/diagram_data'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'

export type DiagramLegendEntry =
    | { entryType: 'connection', kind: DiagramEdgeKind, label: string }
    | { entryType: 'node', label: string, role: DiagramRole }

/** Maps one stored legend entry to its rendered form, keeping the author-supplied label. */
export function diagramLegendEntry(entry: DiagramLegendEntryData): DiagramLegendEntry {
    return 'role' in entry
        ? { entryType: 'node', label: entry.label, role: entry.role }
        : { entryType: 'connection', kind: entry.kind, label: entry.label }
}

/** Derives unique node roles followed by connection kinds, preserving source order within each group. */
export function derivedDiagramLegendEntries(
    roles: readonly DiagramRole[],
    kinds: readonly DiagramEdgeKind[],
): DiagramLegendEntry[] {
    return [
        ...[...new Set(roles)].map((role): DiagramLegendEntry => ({ entryType: 'node', label: role, role })),
        ...[...new Set(kinds)].map((kind): DiagramLegendEntry => ({ entryType: 'connection', kind, label: kind })),
    ]
}

/** Uses explicit legend entries when the diagram carries them, and derives entries only when it has none. */
export function diagramLegendEntries(data: PositionedDiagramData): DiagramLegendEntry[] {
    const legend = data.meta.legend ?? []
    if (legend.length > 0) return legend.map(diagramLegendEntry)

    return derivedDiagramLegendEntries(data.nodes.map(({ role }) => role), data.edges.map(({ kind }) => kind))
}
