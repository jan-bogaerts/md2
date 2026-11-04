import type { DiagramLegendEntryData } from './diagram_data';

/** Stable opaque identity of one legend entry. */
export function diagramLegendEntryKey(entry: DiagramLegendEntryData) {
    return entry.id
}
