import { Box, Typography } from '@mui/material'
import { DiagramLegendConnectionSample } from './diagram_legend_connection_sample'
import type { DiagramLegendEntry } from './diagram_legend_entries'
import { diagramRoleStyle } from './diagram_role_style'

interface DiagramLegendEntryListProps {
    entries: readonly DiagramLegendEntry[]
    label: string
}

/** Renders legend entries without knowing whether they were stored or derived. */
export function DiagramLegendEntryList({ entries, label }: DiagramLegendEntryListProps) {
    return (
        <Box
            aria-label={label}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 0, overflowY: 'auto', p: 1.5 }}
        >
            {entries.map((entry) => (
                <Box
                    key={entry.entryType === 'node' ? `node:${entry.role}` : `connection:${entry.kind}`}
                    sx={{ alignItems: 'center', display: 'flex', gap: 1 }}
                >
                    {entry.entryType === 'node' ? (
                        <Box
                            data-role={entry.role}
                            sx={{ border: '1px solid', borderRadius: 0.5, flexShrink: 0, height: 12, width: 20, ...diagramRoleStyle(entry.role) }}
                        />
                    ) : <DiagramLegendConnectionSample kind={entry.kind} />}
                    <Typography color="text.secondary" variant="caption">{entry.label}</Typography>
                </Box>
            ))}
        </Box>
    )
}
