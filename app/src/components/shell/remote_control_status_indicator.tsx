import { Box, Stack } from '@mui/material'
import { useRemoteControlStatus } from './use_remote_control_status'

/** Status-bar strip showing the remote-control connection state: nothing / accepting / connected. */
export function RemoteControlStatusIndicator() {
    const { bridge, status } = useRemoteControlStatus()

    if (!bridge || !status.active) return null

    const isConnected = status.clientCount > 0

    return (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ bgcolor: isConnected ? 'success.main' : 'warning.main', borderRadius: '50%', height: 7, width: 7 }} />
            <Box component="span">{isConnected ? 'connected' : 'accepting'}</Box>
        </Stack>
    )
}
