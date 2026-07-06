import { Alert, Button, Snackbar, Tooltip } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { getElectronRemoteControlBridge, type RemoteControlStatus } from '../../data/electron_remote_control_bridge'

const INITIAL_STATUS: RemoteControlStatus = { active: false, clientCount: 0, endpoint: null }

function statusLabel(status: RemoteControlStatus) {
    if (!status.active) return 'Remote off'

    return status.clientCount > 0 ? `Remote ${status.clientCount}` : 'Remote on'
}

/** Toolbar control that starts/stops the Electron WebSocket remote-control endpoint. */
export function RemoteControlButton() {
    const bridge = useMemo(() => getElectronRemoteControlBridge(), [])
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isBusy, setIsBusy] = useState(false)
    const [status, setStatus] = useState<RemoteControlStatus>(INITIAL_STATUS)

    useEffect(() => {
        if (!bridge) return undefined

        let isMounted = true
        const unsubscribe = bridge.onStatusChange(setStatus)
        void bridge.getStatus()
            .then((nextStatus) => {
                if (isMounted) setStatus(nextStatus)
            })
            .catch((error: unknown) => {
                if (isMounted) setErrorMessage(error instanceof Error ? error.message : 'Remote-control status failed')
            })

        return () => {
            isMounted = false
            unsubscribe()
        }
    }, [bridge])

    if (!bridge) return null

    const handleClick = async () => {
        setIsBusy(true)
        setErrorMessage(null)

        try {
            setStatus(status.active ? await bridge.stop() : await bridge.start())
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Remote-control toggle failed')
        } finally {
            setIsBusy(false)
        }
    }

    const handleCloseError = () => {
        setErrorMessage(null)
    }

    return (
        <>
            <Tooltip title={status.endpoint ?? 'Remote control is stopped'}>
                <span>
                    <Button color={status.active ? 'success' : 'inherit'} disabled={isBusy} onClick={handleClick} size="small" variant="outlined">
                        {statusLabel(status)}
                    </Button>
                </span>
            </Tooltip>
            <Snackbar autoHideDuration={6000} onClose={handleCloseError} open={!!errorMessage}>
                <Alert onClose={handleCloseError} severity="error" variant="filled">
                    {errorMessage}
                </Alert>
            </Snackbar>
        </>
    )
}
