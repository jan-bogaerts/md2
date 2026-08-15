import { Box, CircularProgress, Stack } from '@mui/material'
import CloudUploadOutline from 'mdi-material-ui/CloudUploadOutline'
import ContentSaveOutline from 'mdi-material-ui/ContentSaveOutline'
import { useProjectPersistence } from '../hooks/use_project_persistence'
import { useProjectSession } from '../hooks/use_project_session'
import { MobileStatusRow } from './mobile_status_row'

/** Status-bar state for local saves and remote pushes. */
export function ProjectSyncStatus({ mobile = false }: { mobile?: boolean }) {
    const { hasPendingPush, localSaveState } = useProjectPersistence()
    const { isPushing } = useProjectSession()
    const isSaving = localSaveState === 'saving'
    const localSaveLabel = isSaving ? 'Saving changes...' : localSaveState === 'dirty' ? 'Dirty' : 'Saved locally'
    const remotePushLabel = isPushing ? 'Pushing...' : hasPendingPush ? 'Changes ready to push' : 'Synced'

    if (mobile) {
        return (
            <>
                <MobileStatusRow
                    icon={isSaving ? <CircularProgress aria-label="Saving" color="inherit" size={18} /> : <ContentSaveOutline sx={{ fontSize: 18 }} />}
                    label="Local save"
                    tone={localSaveState === 'saved' ? 'text.secondary' : 'warning.main'}
                    value={localSaveLabel}
                />
                <MobileStatusRow
                    icon={isPushing ? <CircularProgress aria-label="Pushing" color="inherit" size={18} /> : <CloudUploadOutline sx={{ fontSize: 18 }} />}
                    label="Remote push"
                    tone={hasPendingPush || isPushing ? 'warning.main' : 'text.secondary'}
                    value={remotePushLabel}
                />
            </>
        )
    }

    return (
        <>
            <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', color: localSaveState === 'saved' ? 'text.secondary' : 'warning.main' }}
            >
                {isSaving ? <CircularProgress aria-label="Saving" color="inherit" size={14} /> : <ContentSaveOutline sx={{ fontSize: 14 }} />}
                <Box component="span">{localSaveLabel}</Box>
            </Stack>
            <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', color: hasPendingPush || isPushing ? 'warning.main' : 'text.secondary' }}
            >
                {isPushing ? <CircularProgress aria-label="Pushing" color="inherit" size={14} /> : <CloudUploadOutline sx={{ fontSize: 14 }} />}
                <Box component="span">{remotePushLabel}</Box>
            </Stack>
        </>
    )
}
