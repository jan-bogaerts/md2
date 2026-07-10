import { Button, Dialog, DialogActions, DialogContent, IconButton, Tooltip } from '@mui/material'
import Github from 'mdi-material-ui/Github'
import { useState } from 'react'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { GithubAuthPanel } from '../github_auth_panel'

interface GithubAuthToolbarButtonProps {
    auth: UseGithubAuthResult
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

    return (
        <>
            <Tooltip title="GitHub account">
                <IconButton aria-label="GitHub account" onClick={handleOpenDialog}>
                    <Github />
                </IconButton>
            </Tooltip>
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
