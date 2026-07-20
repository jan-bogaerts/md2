import { Box } from '@mui/material'
import { useSyncExternalStore } from 'react'
import type { MarkdownEditorStateStore } from '../editor/markdown_editor_state_store'
import { usePendingFileSave } from '../hooks/use_pending_file_save'

interface CardBodySaveStatusProps {
    path: string | null
    stateStore: MarkdownEditorStateStore
}

/** Isolated card-body dirty and pending-save presentation subscriber. */
export function CardBodySaveStatus(props: CardBodySaveStatusProps) {
    const { path, stateStore } = props
    const dirty = useSyncExternalStore(stateStore.subscribe, stateStore.getSnapshot, stateStore.getSnapshot)
    const hasPendingFileSave = usePendingFileSave(path)
    const isDirty = dirty || hasPendingFileSave

    return (
        <Box sx={{ alignItems: 'center', color: 'text.disabled', display: 'flex', flexShrink: 0, fontSize: 11.5, gap: '5px' }}>
            <Box sx={{ backgroundColor: isDirty ? 'warning.main' : 'success.main', borderRadius: '50%', height: 7, width: 7 }} />
            {isDirty ? 'Dirty' : 'Saved'}
        </Box>
    )
}
