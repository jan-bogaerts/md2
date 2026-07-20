import { Button, Tooltip } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { RemoteControlConnectionSettings } from '../../data/remote_control_connection'
import { deriveAutoConnectSettings } from '../../data/remote_connect_string'
import { projectSessionService } from '../../services/project/project_session_service'
import { RemoteControlStorageService } from '../../services/data/remote_control_storage_service'
import { requestOpenProjectDialog } from '../project_command_events'
import { RemoteConnectDialog } from './remote_connect_dialog'

/** Browser toolbar button that connects to an Electron remote-control server. */
export function RemoteConnectButton() {
    const [connectedService, setConnectedService] = useState<RemoteControlStorageService | null>(null)
    const [connectedEndpoint, setConnectedEndpoint] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isBusy, setIsBusy] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const autoConnectAttempted = useRef(false)

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

            const activeProject = await service.getActiveProject().catch(() => null)
            if (activeProject) {
                try {
                    const resolution = await projectSessionService.openProject('remote', activeProject, null, service)
                    if (resolution) requestOpenProjectDialog('remote', activeProject, resolution)
                } catch {
                    requestOpenProjectDialog('remote', activeProject)
                }
            } else {
                requestOpenProjectDialog('remote')
            }

            return true
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Remote-control connection failed')

            return false
        } finally {
            setIsBusy(false)
        }
    }

    // Page opened from the Electron server's QR/link carries the token in the fragment: connect at
    // once, skipping the manual dialog. A wrong or stale token opens the dialog to show the error.
    useEffect(() => {
        if (autoConnectAttempted.current) return
        autoConnectAttempted.current = true

        const settings = deriveAutoConnectSettings(window.location.host, window.location.hash, window.location.protocol)
        if (!settings) return

        // Reflecting the async connect result on mount is the point of this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void handleConnect(settings).then((connected) => {
            if (!connected) setIsDialogOpen(true)
        })
    }, [])

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
