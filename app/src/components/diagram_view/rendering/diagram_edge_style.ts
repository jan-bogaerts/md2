import type { Theme } from '@mui/material'
import type {
    DiagramConnectionKindFormatting, DiagramConnectionMarker, DiagramEdgeKind,
} from '../../../services/diagrams/diagram_data'

const DEFAULT_EDGE_STROKE_WIDTH = 1.2
const ACCENT_EDGE_STROKE_WIDTH = 1.5
const FOCUSED_EDGE_STROKE_WIDTH = 3

export interface DiagramEdgeVisualStyle {
    arrowhead: 'filled' | 'open'
    color: string
    endMarker: DiagramConnectionMarker
    startMarker: DiagramConnectionMarker
    strokeDasharray?: string
    strokeWidth: number
}

/** Resolves shared connection appearance for diagram edges and legend samples. */
export function diagramEdgeStyle(
    kind: DiagramEdgeKind,
    theme: Theme,
    focused = false,
    formatting?: DiagramConnectionKindFormatting,
): DiagramEdgeVisualStyle {
    const accent = kind === 'cycle' || kind === 'success'
    const defaultMarker = kind === 'async' ? 'open-arrow' : 'filled-arrow'

    return {
        arrowhead: kind === 'async' ? 'open' : 'filled',
        color: focused ? theme.palette.primary.main : formatting?.line?.color
            ?? (accent ? theme.palette.primary.main : theme.palette.text.secondary),
        endMarker: formatting?.endMarker ?? defaultMarker,
        startMarker: formatting?.startMarker ?? 'none',
        ...(['async', 'cycle', 'return'].includes(kind) ? { strokeDasharray: '4 3' } : {}),
        strokeWidth: focused ? FOCUSED_EDGE_STROKE_WIDTH : formatting?.line?.thickness
            ?? (accent ? ACCENT_EDGE_STROKE_WIDTH : DEFAULT_EDGE_STROKE_WIDTH),
    }
}
