import { Box, Typography } from '@mui/material'
import type { PositionedSequenceFragment } from '../../services/diagrams/diagram_layout'
import {
    diagramEmphasisService, type DiagramEmphasisService, type DiagramSurface,
} from '../../services/diagrams/diagram_emphasis_service'
import { useDiagramDecorationsDimmed } from './use_diagram_emphasis'
import { DIAGRAM_DIMMED_OPACITY } from './diagram_emphasis_presentation'
import { diagramFontStyle } from './diagram_font_style'
import { type DiagramFormattingStore, useDiagramFormattingScale } from './use_diagram_formatting'

interface SequenceFragmentProps {
    emphasis?: DiagramEmphasisService
    emphasisSurface?: DiagramSurface
    formattingStore?: DiagramFormattingStore
    fragment: PositionedSequenceFragment
    onOpenDetails?: () => void
}

/** Sequence alt, opt, or loop frame positioned behind messages. */
export function SequenceFragment({emphasis = diagramEmphasisService, emphasisSurface = 'current', formattingStore, fragment, onOpenDetails}: SequenceFragmentProps) {
    const dimmed = useDiagramDecorationsDimmed(emphasisSurface, emphasis)
    const fontScalePercent = useDiagramFormattingScale('fontScalePercent', formattingStore)
    return (
        <Box
            aria-label={`${fragment.operator} fragment`}
            onDoubleClick={onOpenDetails}
            role="group"
            sx={{
                bgcolor: 'action.hover', border: '1px solid', borderColor: 'custom.borderStrong', borderRadius: 0.5,
                cursor: onOpenDetails ? 'pointer' : undefined, height: fragment.height, left: fragment.x,
                opacity: dimmed ? DIAGRAM_DIMMED_OPACITY : 1, pointerEvents: onOpenDetails ? 'auto' : 'none', position: 'absolute',
                top: fragment.y, width: fragment.width, zIndex: 0,
            }}
        >
            <Typography
                color="text.secondary"
                sx={{ ...diagramFontStyle(undefined, fontScalePercent, 'overline'), bgcolor: 'background.default', border: '1px solid', borderColor: 'custom.borderStrong', left: -1, px: 1, position: 'absolute', top: -1 }}
                variant="overline"
            >
                {fragment.operator}
            </Typography>
            {fragment.guardPositions.map(({ guard, y }) => (
                <Typography
                    color="text.secondary"
                    key={`${guard}:${y}`}
                    sx={{ ...diagramFontStyle(undefined, fontScalePercent, 'caption'), fontFamily: 'monospace', left: 1.5, position: 'absolute', top: y - fragment.y }}
                    variant="caption"
                >
                    [{guard}]
                </Typography>
            ))}
            {fragment.dividerY !== undefined ? (
                <Box sx={{ borderTop: '1px dashed', borderColor: 'custom.borderStrong', left: 1, position: 'absolute', right: 1, top: fragment.dividerY - fragment.y }} />
            ) : null}
        </Box>
    )
}
