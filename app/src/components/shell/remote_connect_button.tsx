import { Button, Tooltip } from '@mui/material'
import { useState } from 'react'
import type { RemoteControlConnectionSettings } from '../../data/remote_control_connection'
import { projectSessionService } from '../../services/project_session_service'
import { RemoteControlStorageService } from '../../services/remote_control_storage_service'
import { requestOpenProjectDialog } from '../project_command_events'
import { RemoteConnectDialog } from './remote_connect_dialog'

/** Browser toolbar button that connects to an Electron remote-control server. */
export function RemoteConnectButton() {
    const [connectedService, setConnectedService] = useState<RemoteControlStorageService | null>(null)
    const [connectedEndpoint, setConnectedEndpoint] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isBusy, setIsBusy] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const handleOpenDialog = () => {
        setErrorMessage(null)
        setIsDialogOpen(true)
    }

    const handleConnect = async (settings: RemoteControlConnectionSettings) => {
        setErrorMessage(null)
        setIsBusy(true)

        try {
            projectSessionService.configureRemote(settings.endpoint, settings.token)
            const service = new RemoteControlStorageService()
            service.init(settings)
            await service.connect()
            setConnectedService(service)
            setConnectedEndpoint(settings.endpoint)
            setIsDialogOpen(false)
            requestOpenProjectDialog('remote')
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Remote-control connection failed')
        } finally {
            setIsBusy(false)
        }
    }

    const handleDisconnect = () => {
        connectedService?.disconnect()
        setConnectedService(null)
        setConnectedEndpoint(null)
        setIsDialogOpen(false)
    }

    return (
        <>
            <Tooltip title={connectedEndpoint ?? 'Connect to a remote md2 server'}>
                <span>
                    <Button color={connectedEndpoint ? 'success' : 'inherit'} onClick={handleOpenDialog} size="small" variant="outlined">
                        {connectedEndpoint ? 'Connected' : 'Connect'}
                    </Button>
                </span>
            </Tooltip>
            <RemoteConnectDialog
                connectedEndpoint={connectedEndpoint}
                errorMessage={errorMessage}
                isBusy={isBusy}
                onClose={() => setIsDialogOpen(false)}
                onConnect={(settings) => void handleConnect(settings)}
                onDisconnect={handleDisconnect}
                open={isDialogOpen}
            />
        </>
    )
}
