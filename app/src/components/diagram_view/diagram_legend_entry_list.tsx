import { Box } from '@mui/material'
import type { DiagramLegendEntry } from './diagram_legend_entries'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramLegendEntryRow, type DiagramFormattingMutationStore } from './diagram_legend_entry_row'

interface DiagramLegendEntryListProps {
    entries: readonly DiagramLegendEntry[]
    label: string
    session?: DiagramEditSessionService
    store: DiagramFormattingMutationStore
}

/** Renders legend entries without knowing whether they were stored or derived. */
export function DiagramLegendEntryList({ entries, label, session, store }: DiagramLegendEntryListProps) {
    return (
        <Box
            aria-label={label}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 0, overflowY: 'auto', p: 1.5 }}
        >
            {entries.map((entry) => <DiagramLegendEntryRow entry={entry} key={entry.entryType === 'node' ? `node:${entry.role}` : `connection:${entry.kind}`} session={session} store={store} />)}
        </Box>
    )
}
