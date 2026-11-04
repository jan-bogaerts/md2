import { useTheme } from '@mui/material'
import type { DiagramEdgeKind } from '../../../services/diagrams/diagram_data'
import { diagramEdgeStyle } from '../rendering/diagram_edge_style'
import { DiagramConnectionMarkerShape } from '../rendering/diagram_connection_marker'
import {
    type DiagramFormattingStore, useDiagramConnectionFormatting, useDiagramConnectionKindFormatting,
} from '../formatting/use_diagram_formatting'

/** Compact connection sample using same visual rules as rendered diagram edges. */
export function DiagramLegendConnectionSample({ kind, legendEntryId, store }: {
    kind: DiagramEdgeKind
    legendEntryId?: string
    store?: DiagramFormattingStore
}) {
    const theme = useTheme()
    const entryFormatting = useDiagramConnectionFormatting(legendEntryId ?? '', kind, store)
    const kindFormatting = useDiagramConnectionKindFormatting(kind, store)
    const formatting = legendEntryId ? entryFormatting : kindFormatting
    const { arrowhead, color, endMarker, startMarker, strokeDasharray, strokeWidth } = diagramEdgeStyle(kind, theme, false, formatting)

    return (
        <svg
            aria-hidden="true"
            data-arrowhead={arrowhead}
            data-kind={kind}
            height="12"
            style={{ color, flexShrink: 0, overflow: 'visible' }}
            width="40"
        >
            <line stroke="currentColor" strokeDasharray={strokeDasharray} strokeWidth={strokeWidth} x1="5" x2="34" y1="6" y2="6" />
            {startMarker === 'none' ? null : <g transform="translate(1 3)"><DiagramConnectionMarkerShape marker={startMarker} /></g>}
            {endMarker === 'none' ? null : <g transform="translate(31 3)"><DiagramConnectionMarkerShape marker={endMarker} /></g>}
        </svg>
    )
}
