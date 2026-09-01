import { Box, Typography } from '@mui/material'
import type { DiagramLegendItem } from '../../services/diagrams/diagram_data'
import { diagramRoleStyle } from './diagram_role_style'

/** Compact semantic-role legend. */
export function DiagramLegend({ items }: { items: DiagramLegendItem[] }) {
    return (
        <Box aria-label="Diagram legend" sx={{ borderColor: 'divider', borderTop: '1px solid', display: 'flex', flexWrap: 'wrap', gap: 2, pt: 1 }}>
            {items.map(({ label, role }) => (
                <Box key={`${role}:${label}`} sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }}>
                    <Box sx={{ border: '1px solid', borderRadius: 0.5, height: 8, width: 12, ...diagramRoleStyle(role) }} />
                    <Typography color="text.secondary" variant="caption">{label}</Typography>
                </Box>
            ))}
        </Box>
    )
}
