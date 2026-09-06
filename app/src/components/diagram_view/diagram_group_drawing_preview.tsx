import { Box } from '@mui/material'
import { useSyncExternalStore } from 'react'
import {
    diagramGroupDrawingService,
    type DiagramGroupDrawingService,
} from '../../services/diagrams/diagram_group_drawing_service'

/** Pointer-transparent rectangle observed only while Group tool draws or awaits its label. */
export function DiagramGroupDrawingPreview({ drawing = diagramGroupDrawingService }: {
    drawing?: Pick<DiagramGroupDrawingService, 'getPreviewSnapshot' | 'subscribePreview'>
}) {
    const preview = useSyncExternalStore(
        drawing.subscribePreview,
        drawing.getPreviewSnapshot,
        drawing.getPreviewSnapshot,
    )
    if (!preview) return null

    return (
        <Box
            aria-hidden="true"
            data-testid="diagram-group-drawing-preview"
            sx={{
                border: '2px dashed', borderColor: 'primary.main', height: preview.height, left: preview.x,
                opacity: 0.7, pointerEvents: 'none', position: 'absolute', top: preview.y, width: preview.width, zIndex: 2,
            }}
        />
    )
}
