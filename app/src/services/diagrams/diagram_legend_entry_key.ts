import type { DiagramLegendEntryData } from './diagram_data';

/** Stable identity of one legend entry: its semantic, because the file format gives entries no ID. */
export function diagramLegendEntryKey(entry: DiagramLegendEntryData) {
    if ('role' in entry) return `node:${entry.role}`
    if ('nodeKind' in entry) return `nodeKind:${entry.nodeKind}`
    return `connection:${entry.kind}`
}
