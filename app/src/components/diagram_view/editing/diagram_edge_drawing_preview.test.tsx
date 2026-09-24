import { ThemeProvider } from '@mui/material'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createAppTheme } from '../../../theme/app_theme'
import { DiagramEdgeDrawingPreview } from './diagram_edge_drawing_preview'

afterEach(cleanup)

describe('DiagramEdgeDrawingPreview', () => {
    it('renders explicit curved preview geometry', () => {
        const preview = {
            controlPoint: { x: 60, y: 20 },
            curved: true,
            kind: 'connection' as const,
            points: [{ x: 20, y: 60 }, { x: 100, y: 60 }],
            sourceAttachment: { nodeId: 'root', offset: 0.5, side: 'right' as const },
            targetAttachment: { nodeId: 'topic', offset: 0.5, side: 'left' as const },
        }
        const drawing = { getPreviewSnapshot: () => preview, subscribePreview: () => () => {} }
        render(
            <ThemeProvider theme={createAppTheme('dark')}>
                <DiagramEdgeDrawingPreview drawing={drawing} />
            </ThemeProvider>,
        )

        expect(screen.getByTestId('diagram-edge-drawing-preview').querySelector('path'))
            .toHaveAttribute('d', 'M 20 60 Q 60 20 100 60')
    })
})
