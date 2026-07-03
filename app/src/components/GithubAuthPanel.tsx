import { Alert, Avatar, Box, Button, CircularProgress, Divider, Link, Paper, Stack, Typography } from '@mui/material'
import type { AuthSnapshot } from '../auth/githubAuthTypes'

const AUTH_PANEL_RADIUS = 2
const AUTH_PANEL_PADDING = 4
const CODE_LETTER_SPACING = 3

interface GithubAuthPanelProps extends AuthSnapshot {
    login: () => Promise<void>
    logout: () => void
}

function getStatusMessage(status: AuthSnapshot['status']) {
    if (status === 'requesting-code') return 'Requesting a GitHub device code...'
    if (status === 'waiting') return 'Waiting for GitHub authorization...'
    if (status === 'denied') return 'GitHub sign-in was denied.'
    if (status === 'expired') return 'The GitHub device code expired.'
    if (status === 'error') return 'GitHub sign-in failed.'

    return null
}

export function GithubAuthPanel(props: GithubAuthPanelProps) {
    const {
        deviceCode,
        errorMessage,
        isAuthenticated,
        isLoadingUser,
        login,
        logout,
        status,
        user,
    } = props

    const statusMessage = getStatusMessage(status)
    const isLoginDisabled = status === 'requesting-code' || status === 'waiting'

    const handleLoginClick = () => {
        void login()
    }

    const handleCopyCodeClick = () => {
        if (!deviceCode) return

        void navigator.clipboard.writeText(deviceCode.userCode)
    }

    const handleOpenGithubClick = () => {
        if (!deviceCode) return

        window.open(deviceCode.verificationUri, '_blank', 'noopener,noreferrer')
    }

    if (isAuthenticated) {
        return (
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: AUTH_PANEL_RADIUS, p: AUTH_PANEL_PADDING }}>
                <Stack spacing={3}>
                    <Box>
                        <Typography component="h1" variant="h4" gutterBottom>
                            MD2
                        </Typography>
                        <Typography color="text.secondary" variant="body1">
                            GitHub authentication is active.
                        </Typography>
                    </Box>

                    <Divider />

                    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                        <Avatar alt={user?.login ?? 'GitHub user'} src={user?.avatarUrl ?? undefined} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography component="p" variant="subtitle1">
                                {isLoadingUser ? 'Loading GitHub user...' : user?.name ?? user?.login ?? 'GitHub user'}
                            </Typography>
                            {user ? (
                                <Link href={user.htmlUrl} rel="noreferrer" target="_blank" variant="body2">
                                    @{user.login}
                                </Link>
                            ) : null}
                        </Box>
                        <Button color="inherit" onClick={logout} variant="outlined">
                            Log out
                        </Button>
                    </Stack>

                    {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}
                </Stack>
            </Paper>
        )
    }

    return (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: AUTH_PANEL_RADIUS, p: AUTH_PANEL_PADDING }}>
            <Stack spacing={3}>
                <Box>
                    <Typography component="h1" variant="h4" gutterBottom>
                        MD2
                    </Typography>
                    <Typography color="text.secondary" variant="body1">
                        Sign in to read and write markdown files from a GitHub repository.
                    </Typography>
                </Box>

                <Button disabled={isLoginDisabled} onClick={handleLoginClick} size="large" variant="contained">
                    Sign in with GitHub
                </Button>

                {statusMessage ? (
                    <Alert severity={status === 'waiting' || status === 'requesting-code' ? 'info' : 'error'}>
                        {statusMessage}
                    </Alert>
                ) : null}

                {deviceCode ? (
                    <Stack spacing={2}>
                        <Box>
                            <Typography color="text.secondary" component="p" variant="body2">
                                User code
                            </Typography>
                            <Typography component="p" sx={{ letterSpacing: CODE_LETTER_SPACING }} variant="h5">
                                {deviceCode.userCode}
                            </Typography>
                        </Box>
                        <Link href={deviceCode.verificationUri} rel="noreferrer" target="_blank">
                            {deviceCode.verificationUri}
                        </Link>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                            <Button onClick={handleCopyCodeClick} variant="outlined">
                                Copy code
                            </Button>
                            <Button onClick={handleOpenGithubClick} variant="outlined">
                                Open GitHub
                            </Button>
                        </Stack>
                    </Stack>
                ) : null}

                {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                {isLoginDisabled ? (
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <CircularProgress size={20} />
                        <Typography color="text.secondary" variant="body2">
                            Authorization in progress
                        </Typography>
                    </Stack>
                ) : null}
            </Stack>
        </Paper>
    )
}
