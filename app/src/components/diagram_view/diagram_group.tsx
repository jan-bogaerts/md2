import { Box, Typography } from '@mui/material'
import type { PositionedDiagramGroup } from '../../services/diagrams/diagram_layout'

/** Non-interactive containment or trust-zone box. */
export function DiagramGroup({ group }: { group: PositionedDiagramGroup }) {
    return (
        <Box
            aria-label={group.label}
            role="group"
            sx={{
                border: '1px dashed', borderColor: 'custom.borderStrong', borderRadius: 1, height: group.height, left: group.x,
                pointerEvents: 'none', position: 'absolute', top: group.y, width: group.width, zIndex: 0,
            }}
        >
            <Typography color="custom.text3" sx={{ bgcolor: 'background.default', left: 1, px: 0.5, position: 'absolute', top: 0.5 }} variant="overline">
                {group.label}
            </Typography>
        </Box>
    )
}
