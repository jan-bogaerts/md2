import { Box, CircularProgress, Stack } from '@mui/material'
import CloudUploadOutline from 'mdi-material-ui/CloudUploadOutline'
import ContentSaveOutline from 'mdi-material-ui/ContentSaveOutline'
import { useProjectPersistence } from '../hooks/use_project_persistence'
import { useProjectSession } from '../hooks/use_project_session'

/** Status-bar state for local saves and remote pushes. */
export function ProjectSyncStatus() {
    const { hasPendingPush, localSaveState } = useProjectPersistence()
    const { isPushing } = useProjectSession()
    const isSaving = localSaveState === 'saving'

    return (
        <>
            <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', color: localSaveState === 'saved' ? 'text.secondary' : 'warning.main' }}
            >
                {isSaving ? <CircularProgress aria-label="Saving" color="inherit" size={14} /> : <ContentSaveOutline sx={{ fontSize: 14 }} />}
                <Box component="span">{isSaving ? 'Saving changes...' : localSaveState === 'dirty' ? 'Dirty' : 'Saved locally'}</Box>
            </Stack>
            <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', color: hasPendingPush || isPushing ? 'warning.main' : 'text.secondary' }}
            >
                {isPushing ? <CircularProgress aria-label="Pushing" color="inherit" size={14} /> : <CloudUploadOutline sx={{ fontSize: 14 }} />}
                <Box component="span">{isPushing ? 'Pushing...' : hasPendingPush ? 'Changes ready to push' : 'Synced'}</Box>
            </Stack>
        </>
    )
}
