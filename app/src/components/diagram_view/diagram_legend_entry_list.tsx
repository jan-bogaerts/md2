import { Box } from '@mui/material'
import type { DiagramLegendEntry } from './diagram_legend_entries'
import { DiagramLegendEntryRow, type DiagramFormattingMutationStore } from './diagram_legend_entry_row'

interface DiagramLegendEntryListProps {
    entries: readonly DiagramLegendEntry[]
    label: string
    store: DiagramFormattingMutationStore
}

/** Renders legend entries without knowing whether they were stored or derived. */
export function DiagramLegendEntryList({ entries, label, store }: DiagramLegendEntryListProps) {
    return (
        <Box
            aria-label={label}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 0, overflowY: 'auto', p: 1.5 }}
        >
            {entries.map((entry) => <DiagramLegendEntryRow entry={entry} key={entry.entryType === 'node' ? `node:${entry.role}` : `connection:${entry.kind}`} store={store} />)}
        </Box>
    )
}
