import { Box, Stack } from '@mui/material'
import DesktopWindowsOutlined from '@mui/icons-material/DesktopWindowsOutlined'
import { MobileStatusRow } from './mobile_status_row'
import { useRemoteControlStatus } from './use_remote_control_status'

/** Status-bar strip showing the remote-control connection state: nothing / accepting / connected. */
export function RemoteControlStatusIndicator({ mobile = false }: { mobile?: boolean }) {
    const { bridge, status } = useRemoteControlStatus()

    if (!bridge || !status.active) return null

    const isConnected = status.clientCount > 0

    if (mobile) {
        return (
            <MobileStatusRow
                icon={<DesktopWindowsOutlined sx={{ fontSize: 18 }} />}
                label="Remote control"
                tone={isConnected ? 'text.secondary' : 'warning.main'}
                value={isConnected ? 'Connected' : 'Accepting'}
            />
        )
    }

    return (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ bgcolor: isConnected ? 'success.main' : 'warning.main', borderRadius: '50%', height: 7, width: 7 }} />
            <Box component="span">{isConnected ? 'connected' : 'accepting'}</Box>
        </Stack>
    )
}
