import { Avatar, Button, Dialog, DialogActions, DialogContent, IconButton, Stack, Tooltip } from '@mui/material'
import Github from 'mdi-material-ui/Github'
import { useState } from 'react'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { GithubAuthPanel } from '../github_auth_panel'

interface GithubAuthToolbarButtonProps {
    auth: UseGithubAuthResult
}

function accountInitials(name: string | null | undefined, login: string | undefined) {
    const displayName = name?.trim() || login?.trim() || '?'
    const initials = displayName.split(/\s+/u).map((part) => part[0]).join('')

    return initials.slice(0, 2).toUpperCase()
}

/** Toolbar entry point for GitHub authentication state and actions. */
export function GithubAuthToolbarButton(props: GithubAuthToolbarButtonProps) {
    const { auth } = props
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const handleOpenDialog = () => {
        setIsDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setIsDialogOpen(false)
    }

    const avatarLabel = auth.user ? `GitHub profile for ${auth.user.login}` : 'GitHub profile'

    return (
        <>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Tooltip title="GitHub account">
                    <IconButton aria-label="GitHub account" onClick={handleOpenDialog} size="small" sx={{ height: 34, width: 34 }}>
                        <Github fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title={avatarLabel}>
                    <IconButton aria-label={avatarLabel} onClick={handleOpenDialog} size="small" sx={{ height: 34, width: 34 }}>
                        <Avatar
                            src={auth.user?.avatarUrl ?? undefined}
                            sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', fontSize: 11, fontWeight: 600, height: 28, width: 28 }}
                        >
                            {accountInitials(auth.user?.name, auth.user?.login)}
                        </Avatar>
                    </IconButton>
                </Tooltip>
            </Stack>
            <Dialog fullWidth maxWidth="sm" onClose={handleCloseDialog} open={isDialogOpen}>
                <DialogContent>
                    <GithubAuthPanel {...auth} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
