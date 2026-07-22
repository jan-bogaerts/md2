import { Box } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import type { CardOpenDocument } from '../../services/open_files_service'

interface CardBodySaveStatusProps {
    document: CardOpenDocument
}

/** Canonical card-file dirty-state presentation. */
export function CardBodySaveStatus(props: CardBodySaveStatusProps) {
    const { document } = props
    const subscribe = useCallback((onStoreChange: () => void) => {
        document.addEventListener('changed', onStoreChange)
        return () => document.removeEventListener('changed', onStoreChange)
    }, [document])
    const getSnapshot = useCallback(() => document.dirty, [document])
    const dirty = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return (
        <Box sx={{ alignItems: 'center', color: 'text.disabled', display: 'flex', flexShrink: 0, fontSize: 11.5, gap: '5px' }}>
            <Box sx={{ backgroundColor: dirty ? 'warning.main' : 'success.main', borderRadius: '50%', height: 7, width: 7 }} />
            {dirty ? 'Dirty' : 'Saved'}
        </Box>
    )
}
