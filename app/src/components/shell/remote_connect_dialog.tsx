import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
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

/** Dialog to enter the remote-control server endpoint and token, prefilled from the last-used values. */
export function RemoteConnectDialog(props: RemoteConnectDialogProps) {
    const { connectedEndpoint, errorMessage, isBusy, onClose, onConnect, onDisconnect, open } = props
    const [endpoint, setEndpoint] = useState('')
    const [token, setToken] = useState('')
    const [wasOpen, setWasOpen] = useState(false)

    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            const stored = tryReadRemoteControlConnection()
            if (stored) {
                if (endpoint.length === 0) setEndpoint(stored.endpoint)
                if (token.length === 0) setToken(stored.token)
            }
        }
    }

    const handleEndpointChange = (event: ChangeEvent<HTMLInputElement>) => setEndpoint(event.target.value)
    const handleTokenChange = (event: ChangeEvent<HTMLInputElement>) => setToken(event.target.value)
    const handleConnectClick = () => onConnect({ endpoint, token })

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
                            <TextField label="Token" onChange={handleTokenChange} size="small" type="password" value={token} />
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
                    <Button disabled={endpoint.length === 0 || token.length === 0 || isBusy} onClick={handleConnectClick} variant="contained">
                        Connect
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}
