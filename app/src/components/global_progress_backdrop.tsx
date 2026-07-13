import { Backdrop, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material'
import { useSyncExternalStore } from 'react'
import { GLOBAL_PROGRESS_EVENT, globalProgressService } from '../services/global_progress_service'

const PROGRESS_PANEL_WIDTH = 320

function getProgressSnapshot() {
    return globalProgressService.getProgress()
}

function subscribeToProgress(onStoreChange: () => void) {
    globalProgressService.addEventListener(GLOBAL_PROGRESS_EVENT, onStoreChange)

    return () => globalProgressService.removeEventListener(GLOBAL_PROGRESS_EVENT, onStoreChange)
}

/** Blocks the application while a global operation reports progress. */
export function GlobalProgressBackdrop() {
    const progress = useSyncExternalStore(subscribeToProgress, getProgressSnapshot)
    if (!progress) return null

    const percentage = progress.completed / progress.total * 100

    return (
        <Backdrop
            open
            sx={{ bgcolor: 'rgba(0, 0, 0, 0.72)', color: 'common.white', zIndex: (theme) => theme.zIndex.modal + 1 }}
        >
            <Stack aria-label="Updating files" role="status" spacing={2} sx={{ alignItems: 'center', width: PROGRESS_PANEL_WIDTH }}>
                <CircularProgress aria-label="Working" color="inherit" />
                <Typography>{progress.info}</Typography>
                <LinearProgress
                    aria-label="File update progress"
                    sx={{ width: '100%' }}
                    value={percentage}
                    variant="determinate"
                />
                <Typography variant="body2">{progress.completed} of {progress.total}</Typography>
            </Stack>
        </Backdrop>
    )
}
