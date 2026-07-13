import { Button, Tooltip } from '@mui/material'
import { useState } from 'react'
import type { RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { dialogService } from '../../services/dialog_service'
import { RemoteConnectButton } from './remote_connect_button'
import { useRemoteControlStatus } from './use_remote_control_status'

function buttonLabel(status: RemoteControlStatus) {
    return status.active ? 'Stop accepting' : 'Accept'
}

function tooltipLabel(status: RemoteControlStatus) {
    return status.active ? 'stop accepting external connections' : 'accept external connection for web control'
}

/** Toolbar control: starts/stops the Electron remote-control endpoint, or connects to one from the browser. */
export function RemoteControlButton() {
    const { bridge, status, setStatus } = useRemoteControlStatus()
    const [isBusy, setIsBusy] = useState(false)

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
                    {buttonLabel(status)}
                </Button>
            </span>
        </Tooltip>
    )
}
