import { Button, Tooltip } from '@mui/material'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RemoteControlConnectionSettings } from '../../data/remote_control_connection'
import { deriveAutoConnectSettings } from '../../data/remote_connect_string'
import { remoteConnectionService } from '../../services/data/remote_connection_service'
import type { RemoteControlStorageService } from '../../services/data/remote_control_storage_service'
import { projectSessionService } from '../../services/project/project_session_service'
import { requestOpenProjectDialog } from '../project_command_events'
import { RemoteConnectDialog } from './remote_connect_dialog'

async function openRemoteProject(storage: RemoteControlStorageService) {
    const activeProject = await storage.getActiveProject().catch(() => null)
    if (!activeProject) {
        requestOpenProjectDialog('remote')

        return
    }

    try {
        const resolution = await projectSessionService.openProject('remote', activeProject, null, storage)
        if (resolution) requestOpenProjectDialog('remote', activeProject, resolution)
    } catch {
        requestOpenProjectDialog('remote', activeProject)
    }
}

async function connectRemoteProject(settings: RemoteControlConnectionSettings) {
    try {
        const storage = await remoteConnectionService.connect(settings)
        await remoteConnectionService.runProjectOpenFlow(() => openRemoteProject(storage))

        return true
    } catch {
        return false
    }
}

/** Browser toolbar button bound to singleton remote-connection state. */
export function RemoteConnectButton() {
    const connection = useSyncExternalStore(
        remoteConnectionService.subscribe,
        remoteConnectionService.getSnapshot,
        remoteConnectionService.getSnapshot,
    )
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const connectedEndpoint = connection.status === 'ready' || connection.status === 'reconnecting'
        ? connection.endpoint
        : null

    const handleOpenDialog = () => setIsDialogOpen(true)

    const handleConnect = async (settings: RemoteControlConnectionSettings) => {
        const connected = await connectRemoteProject(settings)
        if (connected) setIsDialogOpen(false)

        return connected
    }

    useEffect(() => {
        const settings = deriveAutoConnectSettings(window.location.host, window.location.hash, window.location.protocol)
        if (!settings) return

        void connectRemoteProject(settings).then((connected) => {
            if (!connected) setIsDialogOpen(true)
        })
    }, [])

    const handleDisconnect = () => {
        remoteConnectionService.disconnect()
        setIsDialogOpen(false)
    }

    const buttonLabel = connection.status === 'ready'
        ? 'Connected'
        : connection.status === 'reconnecting'
            ? 'Reconnecting'
            : connection.status === 'connecting'
                ? 'Connecting'
                : 'Connect'
    const tooltip = connection.errorMessage ?? connection.endpoint ?? 'Connect to a remote md2 server'

    return (
        <>
            <Tooltip title={tooltip}>
                <span>
                    <Button
                        color={connection.status === 'ready' ? 'success' : 'inherit'}
                        disabled={connection.status === 'connecting'}
                        onClick={handleOpenDialog}
                        size="small"
                        variant="outlined"
                    >
                        {buttonLabel}
                    </Button>
                </span>
            </Tooltip>
            <RemoteConnectDialog
                connectedEndpoint={connectedEndpoint}
                errorMessage={connection.errorMessage}
                isBusy={connection.status === 'connecting' || connection.status === 'reconnecting'}
                onClose={() => setIsDialogOpen(false)}
                onConnect={(settings) => void handleConnect(settings)}
                onDisconnect={handleDisconnect}
                open={isDialogOpen}
            />
        </>
    )
}
