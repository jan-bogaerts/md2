import { Box, Button, LinearProgress, Paper, Snackbar, Stack, Typography } from '@mui/material'
import { useSyncExternalStore } from 'react'
import { updateService, type UpdateService } from '../../services/update_service'

interface UpdateNotificationProps {
    service?: UpdateService
}

function computePercent(received: number, total: number | null) {
    if (!total || total <= 0) return 0

    return Math.min(100, Math.round((received / total) * 100))
}

/** Persistent application update offer, progress, and retry notification. */
export function UpdateNotification({ service = updateService }: UpdateNotificationProps) {
    const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
    if (snapshot.state === 'idle') return null

    const handleDismiss = () => service.dismiss()
    const handleInstall = () => {
        void service.install()
    }
    const determinate = snapshot.total !== null && snapshot.total > 0
    const percent = computePercent(snapshot.received, snapshot.total)
    const message = snapshot.state === 'launching'
        ? 'Launching installer…'
        : snapshot.state === 'downloading'
            ? `Downloading version ${snapshot.version}…`
            : snapshot.state === 'error'
                ? snapshot.error
                : `Version ${snapshot.version} is available.`

    return (
        <Snackbar anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} open>
            <Paper role={snapshot.state === 'error' ? 'alert' : undefined} sx={{ maxWidth: 360, p: 2 }}>
                <Stack spacing={1.5}>
                    <Typography variant="body2">{message}</Typography>
                    {snapshot.state === 'downloading' || snapshot.state === 'launching' ? (
                        <Box>
                            <LinearProgress
                                value={determinate ? percent : undefined}
                                variant={determinate ? 'determinate' : 'indeterminate'}
                            />
                        </Box>
                    ) : (
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                            <Button onClick={handleDismiss} size="small" variant="outlined">Dismiss</Button>
                            <Button onClick={handleInstall} size="small" variant="contained">
                                {snapshot.state === 'error' ? 'Retry' : 'Install'}
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </Paper>
        </Snackbar>
    )
}
