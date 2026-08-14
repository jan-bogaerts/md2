import { Box, Button, LinearProgress, Paper, Snackbar, Stack, Typography } from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    getElectronUpdateBridge,
    type DownloadProgress,
    type UpdateInfo,
} from '../../data/electron_update_bridge'

type Phase = 'available' | 'downloading' | 'launching'

function computePercent(progress: DownloadProgress | null) {
    if (!progress || progress.total <= 0) return 0

    return Math.min(100, Math.round((progress.received / progress.total) * 100))
}

/**
 * Persistent snackbar offering the newly released version. Install streams the installer in the main
 * process; a progress bar tracks the download, then the app quits as the installer launches.
 */
export function UpdateNotification() {
    const bridge = useMemo(() => getElectronUpdateBridge(), [])
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
    const [phase, setPhase] = useState<Phase>('available')
    const [progress, setProgress] = useState<DownloadProgress | null>(null)
    const dismissedRef = useRef(false)

    useEffect(() => {
        if (!bridge) return undefined

        return bridge.onUpdateAvailable((info) => {
            // A dismissed offer is not re-shown until the next startup.
            if (dismissedRef.current) return
            setUpdateInfo(info)
        })
    }, [bridge])

    useEffect(() => {
        if (!bridge) return undefined

        return bridge.onDownloadProgress((next) => {
            setProgress(next)
            if (next.total > 0 && next.received >= next.total) setPhase('launching')
        })
    }, [bridge])

    if (!bridge || !updateInfo) return null

    const handleInstall = () => {
        setPhase('downloading')
        void bridge.downloadUpdate(updateInfo.downloadUrl)
    }

    const handleDismiss = () => {
        dismissedRef.current = true
        setUpdateInfo(null)
    }

    const percent = computePercent(progress)

    return (
        <Snackbar anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} open>
            <Paper elevation={6} sx={{ maxWidth: 360, p: 2 }}>
                <Stack spacing={1.5}>
                    <Typography variant="body2">
                        {phase === 'launching'
                            ? 'Launching installer…'
                            : `Version ${updateInfo.version} is available.`}
                    </Typography>
                    {phase === 'available' ? (
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                            <Button onClick={handleDismiss} size="small">Dismiss</Button>
                            <Button onClick={handleInstall} size="small" variant="contained">Install</Button>
                        </Stack>
                    ) : (
                        <Box>
                            <LinearProgress
                                value={percent}
                                variant={progress ? 'determinate' : 'indeterminate'}
                            />
                        </Box>
                    )}
                </Stack>
            </Paper>
        </Snackbar>
    )
}
