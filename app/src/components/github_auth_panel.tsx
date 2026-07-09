import { useState, type ChangeEvent } from 'react'
import { Alert, Avatar, Box, Button, CircularProgress, Divider, Link, Paper, Stack, TextField, Typography } from '@mui/material'
import type { AuthSnapshot } from '../auth/github_auth_types'

const AUTH_PANEL_RADIUS = 2
const AUTH_PANEL_PADDING = 4
const CODE_LETTER_SPACING = 3

interface GithubAuthPanelProps extends AuthSnapshot {
    isDeviceFlowAvailable: boolean
    login: () => Promise<void>
    logout: () => void
    savePersonalAccessToken: (accessToken: string) => Promise<void>
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
        authMethod,
        deviceCode,
        errorMessage,
        isAuthenticated,
        isDeviceFlowAvailable,
        isLoadingUser,
        login,
        logout,
        savePersonalAccessToken,
        status,
        user,
    } = props
    const [personalAccessToken, setPersonalAccessToken] = useState('')

    const statusMessage = getStatusMessage(status)
    const isLoginDisabled = !isDeviceFlowAvailable || status === 'requesting-code' || status === 'waiting'
    const isSaveTokenDisabled = personalAccessToken.trim().length === 0 || isLoadingUser

    const handleLoginClick = () => {
        void login()
    }

    const handlePersonalAccessTokenChange = (event: ChangeEvent<HTMLInputElement>) => {
        setPersonalAccessToken(event.target.value)
    }

    const handleSavePersonalAccessTokenClick = () => {
        void savePersonalAccessToken(personalAccessToken)
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
        const signedInText = authMethod === 'pat'
            ? 'Signed in with personal access token.'
            : 'Signed in with GitHub device flow.'
        const logoutLabel = authMethod === 'pat' ? 'Remove token' : 'Log out'

        return (
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: AUTH_PANEL_RADIUS, p: AUTH_PANEL_PADDING }}>
                <Stack spacing={3}>
                    <Box>
                        <Typography component="h1" variant="h4" gutterBottom>
                            MD²
                        </Typography>
                        <Typography color="text.secondary" variant="body1">
                            {signedInText}
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
                            {logoutLabel}
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
                        MD²
                    </Typography>
                    <Typography color="text.secondary" variant="body1">
                        Sign in to read and write markdown files from a GitHub repository.
                    </Typography>
                </Box>

                <Button disabled={isLoginDisabled} onClick={handleLoginClick} size="large" variant="contained">
                    Sign in with GitHub
                </Button>
                {!isDeviceFlowAvailable ? (
                    <Alert severity="info">
                        GitHub device login is not configured. Use a personal access token instead.
                    </Alert>
                ) : null}

                <Divider />

                <Stack spacing={1.5}>
                    <Typography component="h2" variant="h6">
                        Use a personal access token
                    </Typography>
                    <TextField
                        autoComplete="off"
                        disabled={isLoadingUser}
                        helperText={(
                            <span>
                                Fine-grained token needs Contents read/write on target repositories.{' '}
                                <Link href="https://github.com/settings/personal-access-tokens/new" rel="noreferrer" target="_blank">
                                    Create token
                                </Link>
                            </span>
                        )}
                        label="Personal access token"
                        onChange={handlePersonalAccessTokenChange}
                        size="small"
                        type="password"
                        value={personalAccessToken}
                    />
                    <Button disabled={isSaveTokenDisabled} onClick={handleSavePersonalAccessTokenClick} variant="outlined">
                        Save token
                    </Button>
                </Stack>

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
