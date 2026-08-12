import { Button, IconButton, Stack, Tooltip } from '@mui/material'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import { useState } from 'react'
import type { RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { dialogService } from '../../services/dialog_service'
import { RemoteConnectButton } from './remote_connect_button'
import { RemoteControlConnectionInfo } from './remote_control_connection_info'
import { useRemoteControlStatus } from './use_remote_control_status'

function buttonLabel(status: RemoteControlStatus) {
    return status.active ? 'Disconnect' : 'Serve'
}

function tooltipLabel(status: RemoteControlStatus) {
    return status.active ? 'disconnect' : 'serve app for web control'
}

/** Toolbar control: starts/stops the Electron remote-control endpoint, or connects to one from the browser. */
export function RemoteControlButton() {
    const { bridge, status, setStatus } = useRemoteControlStatus()
    const [isBusy, setIsBusy] = useState(false)
    const [isInfoOpen, setIsInfoOpen] = useState(false)
    const [buttonElement, setButtonElement] = useState<HTMLButtonElement | null>(null)

    if (!bridge) return <RemoteConnectButton />

    const handleClick = async () => {
        setIsBusy(true)

        try {
            if (status.active) {
                setStatus(await bridge.stop())
                setIsInfoOpen(false)
            } else {
                setStatus(await bridge.start())
                setIsInfoOpen(true)
            }
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Remote-control toggle failed' })
        } finally {
            setIsBusy(false)
        }
    }

    const handleToggleInfo = () => setIsInfoOpen((open) => !open)
    const handleCloseInfo = () => setIsInfoOpen(false)

    return (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Tooltip title={tooltipLabel(status)}>
                <span>
                    <Button
                        color={status.active ? 'success' : 'inherit'}
                        disabled={isBusy}
                        onClick={handleClick}
                        ref={setButtonElement}
                        size="small"
                        variant="outlined"
                    >
                        {buttonLabel(status)}
                    </Button>
                </span>
            </Tooltip>
            {status.active ? (
                <>
                    <Tooltip title="show connect link and QR code">
                        <IconButton
                            aria-label="show connect link and QR code"
                            color="inherit"
                            onClick={handleToggleInfo}
                            size="small"
                        >
                            <ArrowDropDownIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <RemoteControlConnectionInfo
                        anchorEl={buttonElement}
                        onClose={handleCloseInfo}
                        open={isInfoOpen}
                        status={status}
                    />
                </>
            ) : null}
        </Stack>
    )
}
