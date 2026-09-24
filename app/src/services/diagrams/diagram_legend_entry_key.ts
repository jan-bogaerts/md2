import type { DiagramLegendEntryData } from './diagram_data';

/** Stable identity of one legend entry: its semantic, because the file format gives entries no ID. */
export function diagramLegendEntryKey(entry: DiagramLegendEntryData) {
    return 'role' in entry ? `node:${entry.role}` : `connection:${entry.kind}`
}

