import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { parseRemoteConnectString } from '../../data/remote_connect_string'
import { tryReadRemoteControlConnection, type RemoteControlConnectionSettings } from '../../data/remote_control_connection'

interface RemoteConnectDialogProps {
    connectedEndpoint: string | null
    errorMessage: string | null
    isBusy: boolean
    open: boolean
    onClose: () => void
    onConnect: (settings: RemoteControlConnectionSettings) => void
    onDisconnect: () => void
}

/** Dialog to enter the remote-control server endpoint, prefilled from the last-used value. */
export function RemoteConnectDialog(props: RemoteConnectDialogProps) {
    const { connectedEndpoint, errorMessage, isBusy, onClose, onConnect, onDisconnect, open } = props
    const [endpoint, setEndpoint] = useState('')
    const [wasOpen, setWasOpen] = useState(false)

    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            const stored = tryReadRemoteControlConnection()
            if (stored) {
                if (endpoint.length === 0) setEndpoint(stored.endpoint)
            }
        }
    }

    const handleEndpointChange = (event: ChangeEvent<HTMLInputElement>) => {
        // A pasted served-app URL is converted to its WebSocket endpoint.
        const connect = parseRemoteConnectString(event.target.value)
        if (connect) {
            setEndpoint(connect.endpoint)
            return
        }

        setEndpoint(event.target.value)
    }
    const handleConnectClick = () => onConnect({ endpoint })

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
            <DialogTitle>Connect to remote server</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {connectedEndpoint ? (
                        <Typography variant="body2">Connected to {connectedEndpoint}</Typography>
                    ) : (
                        <>
                            <TextField label="Endpoint" onChange={handleEndpointChange} size="small" value={endpoint} />
                        </>
                    )}
                    {errorMessage ? <Typography color="error" variant="body2">{errorMessage}</Typography> : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                {connectedEndpoint ? (
                    <Button onClick={onDisconnect} variant="outlined">Disconnect</Button>
                ) : (
                    <Button disabled={endpoint.length === 0 || isBusy} onClick={handleConnectClick} variant="contained">
                        Connect
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}
