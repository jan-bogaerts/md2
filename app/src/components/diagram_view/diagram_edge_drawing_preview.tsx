import { useTheme } from '@mui/material'
import { useSyncExternalStore } from 'react'
import {
    diagramEdgeDrawingService,
    type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service'
import type { DiagramWaypoint } from '../../services/diagrams/diagram_data'
import { roundedDiagramPath } from './diagram_path'

/** Pointer-transparent route preview; only this leaf observes transient edge drawing state. */
export function DiagramEdgeDrawingPreview({ drawing = diagramEdgeDrawingService }: {
    drawing?: Pick<DiagramEdgeDrawingService, 'getPreviewSnapshot' | 'subscribePreview'>
}) {
    const theme = useTheme()
    const preview = useSyncExternalStore(
        drawing.subscribePreview,
        drawing.getPreviewSnapshot,
        drawing.getPreviewSnapshot,
    )
    if (!preview || preview.points.length < 2) return null

    return (
        <svg
            aria-hidden="true"
            data-testid="diagram-edge-drawing-preview"
            height="100%"
            style={{ left: 0, overflow: 'visible', pointerEvents: 'none', position: 'absolute', top: 0, zIndex: 1 }}
            width="100%"
        >
            <path
                d={roundedDiagramPath([...preview.points] as DiagramWaypoint[])}
                fill="none"
                stroke={theme.palette.primary.main}
                strokeDasharray="6 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
            />
        </svg>
    )
}
