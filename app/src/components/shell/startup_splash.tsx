import { Box, CircularProgress, Stack, Typography } from '@mui/material'

/** Full-screen splash shown while services start and the last project loads. */
export function StartupSplash() {
    return (
        <Box sx={{ alignItems: 'center', display: 'flex', height: '100vh', justifyContent: 'center' }}>
            <Stack spacing={2} sx={{ alignItems: 'center' }}>
                <CircularProgress />
                <Typography color="text.secondary" variant="body1">
                    Starting MD2...
                </Typography>
            </Stack>
        </Box>
    )
}
