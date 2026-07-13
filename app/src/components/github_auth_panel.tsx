import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Avatar, Box, Button, Divider, Link, Paper, Stack, TextField, Typography } from '@mui/material'
import type { AuthSnapshot } from '../auth/github_auth_types'
import { dialogService } from '../services/dialog_service'

const AUTH_PANEL_RADIUS = 2
const AUTH_PANEL_PADDING = 4

interface GithubAuthPanelProps extends AuthSnapshot {
    logout: () => void
    savePersonalAccessToken: (accessToken: string) => Promise<void>
}

export function GithubAuthPanel(props: GithubAuthPanelProps) {
    const {
        errorMessage,
        isAuthenticated,
        isLoadingUser,
        logout,
        savePersonalAccessToken,
        user,
    } = props
    const [personalAccessToken, setPersonalAccessToken] = useState('')

    const isSaveTokenDisabled = personalAccessToken.trim().length === 0 || isLoadingUser
    const reportedServiceErrorRef = useRef<string | null>(null)

    useEffect(() => {
        if (!errorMessage) {
            reportedServiceErrorRef.current = null

            return
        }

        if (errorMessage === reportedServiceErrorRef.current) return

        dialogService.error(errorMessage)
        reportedServiceErrorRef.current = errorMessage
    }, [errorMessage])

    const handlePersonalAccessTokenChange = (event: ChangeEvent<HTMLInputElement>) => {
        setPersonalAccessToken(event.target.value)
    }

    const handleSavePersonalAccessTokenClick = () => {
        void savePersonalAccessToken(personalAccessToken)
    }

    if (isAuthenticated) {
        return (
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: AUTH_PANEL_RADIUS, p: AUTH_PANEL_PADDING }}>
                <Stack spacing={3}>
                    <Box>
                        <Typography component="h1" variant="h4" gutterBottom>
                            MD²
                        </Typography>
                        <Typography color="text.secondary" variant="body1">
                            Signed in with personal access token.
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
                            Remove token
                        </Button>
                    </Stack>
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
                        Sign in with a personal access token to read and write markdown files from a GitHub repository.
                    </Typography>
                </Box>

                <Stack spacing={1.5}>
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
                        placeholder="Enter token here"
                        slotProps={{ inputLabel: { shrink: true } }}
                        onChange={handlePersonalAccessTokenChange}
                        size="small"
                        type="password"
                        value={personalAccessToken}
                    />
                    <Button disabled={isSaveTokenDisabled} onClick={handleSavePersonalAccessTokenClick} variant="contained">
                        Save token
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    )
}
