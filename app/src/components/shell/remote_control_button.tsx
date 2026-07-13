import { Button, Tooltip } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { getElectronRemoteControlBridge, type ElectronRemoteControlBridge, type RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { dialogService } from '../../services/dialog_service'
import { RemoteConnectButton } from './remote_connect_button'

const INITIAL_STATUS: RemoteControlStatus = { active: false, clientCount: 0, endpoint: null, token: null }

interface MountState {
    isMounted: boolean
}

function statusLabel(status: RemoteControlStatus) {
    if (!status.active) return 'Remote off'

    return status.clientCount > 0 ? `Remote ${status.clientCount}` : 'Remote on'
}

function tooltipLabel(status: RemoteControlStatus) {
    if (!status.endpoint) return 'Remote control is stopped'

    return status.token ? `${status.endpoint} token ${status.token}` : status.endpoint
}

async function loadRemoteControlStatus(
    bridge: ElectronRemoteControlBridge,
    mountState: MountState,
    setStatus: (status: RemoteControlStatus) => void,
) {
    try {
        const nextStatus = await bridge.getStatus()
        if (mountState.isMounted) setStatus(nextStatus)
    } catch (error) {
        if (mountState.isMounted) dialogService.error(error, { fallbackMessage: 'Remote-control status failed' })
    }
}

/** Toolbar control: starts/stops the Electron remote-control endpoint, or connects to one from the browser. */
export function RemoteControlButton() {
    const bridge = useMemo(() => getElectronRemoteControlBridge(), [])
    const [isBusy, setIsBusy] = useState(false)
    const [status, setStatus] = useState<RemoteControlStatus>(INITIAL_STATUS)

    useEffect(() => {
        if (!bridge) return undefined

        const mountState = { isMounted: true }
        const unsubscribe = bridge.onStatusChange(setStatus)
        void loadRemoteControlStatus(bridge, mountState, setStatus)

        return () => {
            mountState.isMounted = false
            unsubscribe()
        }
    }, [bridge])

    if (!bridge) return <RemoteConnectButton />

    const handleClick = async () => {
        setIsBusy(true)

        try {
            setStatus(status.active ? await bridge.stop() : await bridge.start())
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Remote-control toggle failed' })
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <Tooltip title={tooltipLabel(status)}>
            <span>
                <Button color={status.active ? 'success' : 'inherit'} disabled={isBusy} onClick={handleClick} size="small" variant="outlined">
                    {statusLabel(status)}
                </Button>
            </span>
        </Tooltip>
    )
}
