import { Box, Typography } from '@mui/material'
import type { PositionedSequenceFragment } from '../../services/diagrams/diagram_layout'

interface SequenceFragmentProps {
    fragment: PositionedSequenceFragment
}

/** Sequence alt, opt, or loop frame positioned behind messages. */
export function SequenceFragment({ fragment }: SequenceFragmentProps) {
    return (
        <Box
            aria-label={`${fragment.operator} fragment`}
            role="group"
            sx={{
                bgcolor: 'action.hover', border: '1px solid', borderColor: 'custom.borderStrong', borderRadius: 0.5,
                height: fragment.height, left: fragment.x, pointerEvents: 'none', position: 'absolute',
                top: fragment.y, width: fragment.width, zIndex: 0,
            }}
        >
            <Typography
                color="text.secondary"
                sx={{ bgcolor: 'background.default', border: '1px solid', borderColor: 'custom.borderStrong', left: -1, px: 1, position: 'absolute', top: -1 }}
                variant="overline"
            >
                {fragment.operator}
            </Typography>
            {fragment.guardPositions.map(({ guard, y }) => (
                <Typography
                    color="text.secondary"
                    key={`${guard}:${y}`}
                    sx={{ fontFamily: 'monospace', left: 1.5, position: 'absolute', top: y - fragment.y }}
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
