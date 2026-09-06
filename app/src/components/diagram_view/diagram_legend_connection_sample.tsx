import { useTheme } from '@mui/material'
import type { DiagramEdgeKind } from '../../services/diagrams/diagram_data'
import { diagramEdgeStyle } from './diagram_edge_style'

/** Compact connection sample using same visual rules as rendered diagram edges. */
export function DiagramLegendConnectionSample({ kind }: { kind: DiagramEdgeKind }) {
    const theme = useTheme()
    const { arrowhead, color, strokeDasharray, strokeWidth } = diagramEdgeStyle(kind, theme)

    return (
        <svg
            aria-hidden="true"
            data-arrowhead={arrowhead}
            data-kind={kind}
            height="12"
            style={{ color, flexShrink: 0, overflow: 'visible' }}
            width="40"
        >
            <line stroke="currentColor" strokeDasharray={strokeDasharray} strokeWidth={strokeWidth} x1="1" x2="32" y1="6" y2="6" />
            {arrowhead === 'open'
                ? <polyline fill="none" points="31 2, 38 6, 31 10" stroke="currentColor" strokeWidth={strokeWidth} />
                : <path d="M31,2 L39,6 L31,10 Z" fill="currentColor" />}
        </svg>
    )
}
