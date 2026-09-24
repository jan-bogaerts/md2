import type { DiagramConnectionMarker } from '../../../services/diagrams/diagram_data'

/** SVG marker shape shared by diagram connections and legend samples. */
export function DiagramConnectionMarkerShape({ marker }: { marker: DiagramConnectionMarker }) {
    if (marker === 'none') return null
    if (marker === 'open-arrow') {
        return <polyline fill="none" points="0 0, 8 3, 0 6" stroke="currentColor" strokeWidth="1.2" />
    }
    if (marker === 'circle') return <circle cx="4" cy="3" fill="currentColor" r="2.5" />
    if (marker === 'diamond') return <path d="M0,3 L4,0 L8,3 L4,6 Z" fill="currentColor" />

    return <path d="M0,0 L8,3 L0,6 Z" fill="currentColor" />
}
