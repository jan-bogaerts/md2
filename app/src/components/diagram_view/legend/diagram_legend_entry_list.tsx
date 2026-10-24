import { Box } from '@mui/material'
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { DiagramLegendEntry } from './diagram_legend_entries'
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { DiagramLegendEntryRow, type DiagramFormattingMutationStore } from './diagram_legend_entry_row'
import type { DiagramFormattingStore } from '../formatting/use_diagram_formatting'

interface DiagramLegendEntryListProps {
    entries: readonly DiagramLegendEntry[]
    label: string
    reader: DiagramFormattingStore
    session?: DiagramEditSessionService
    store: DiagramFormattingMutationStore
}

function legendEntryKey(entry: DiagramLegendEntry) {
    return entry.entryType === 'node' ? `node:${entry.role}`
        : entry.entryType === 'nodeKind' ? `nodeKind:${entry.nodeKind}` : `connection:${entry.kind}`
}

/**
 * Renders legend entries without knowing whether they were stored or derived. With an edit session the
 * rows can be reordered by dragging their handle.
 */
export function DiagramLegendEntryList({ entries, label, reader, session, store }: DiagramLegendEntryListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )
    const entryKeys = entries.map(legendEntryKey)
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!session || !over || over.id === active.id) return
        session.legend.materializeDerivedLegend()
        session.legend.moveLegendEntry(String(active.id), entryKeys.indexOf(String(over.id)))
    }
    const rows = entries.map((entry, index) => (
        <DiagramLegendEntryRow
            entry={entry}
            entryKey={entryKeys[index]}
            key={entryKeys[index]}
            reader={reader}
            session={session}
            store={store}
        />
    ))

    return (
        <Box
            aria-label={label}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 0, overflowY: 'auto', p: 1.5 }}
        >
            {session ? (
                <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
                    <SortableContext items={entryKeys} strategy={verticalListSortingStrategy}>{rows}</SortableContext>
                </DndContext>
            ) : rows}
        </Box>
    )
}
