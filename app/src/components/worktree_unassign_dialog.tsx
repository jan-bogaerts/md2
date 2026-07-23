import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'

interface WorktreeUnassignDialogProps {
    busy: boolean
    commitMessage: string
    onClose: () => void
    onCommitMessageChange: (message: string) => void
    onCommitIntegrate: (message: string) => Promise<void>
    onDrop: () => Promise<void>
    open: boolean
}

/** Resolves dirty worktree changes before returning a card to Primary. */
export function WorktreeUnassignDialog(props: WorktreeUnassignDialogProps) {
    const { busy, commitMessage, onClose, onCommitIntegrate, onCommitMessageChange, onDrop, open } = props
    const handleMessageChange = (event: ChangeEvent<HTMLInputElement>) => onCommitMessageChange(event.target.value)
    const handleCommitIntegrate = async () => onCommitIntegrate(commitMessage)

    return (
        <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
            <DialogTitle>Worktree has uncommitted changes</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <DialogContentText>
                    Commit and integrate changes into the project before returning this worktree to its parked state,
                    or permanently drop all tracked and untracked changes.
                </DialogContentText>
                <Typography color="text.secondary">Commit message</Typography>
                <TextField autoFocus disabled={busy} onChange={handleMessageChange} size="small" value={commitMessage} />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button color="error" disabled={busy} onClick={onDrop}>Drop changes</Button>
                <Button disabled={busy || commitMessage.trim().length === 0} onClick={handleCommitIntegrate} variant="contained">
                    Commit & integrate
                </Button>
            </DialogActions>
        </Dialog>
    )
}
