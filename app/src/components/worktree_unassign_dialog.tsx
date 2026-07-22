import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'

interface WorktreeUnassignDialogProps {
    busy: boolean
    commitMessage: string
    onClose: () => void
    onCommitMessageChange: (message: string) => void
    onCommitPush: (message: string) => Promise<void>
    onDrop: () => Promise<void>
    open: boolean
}

/** Resolves dirty worktree changes before returning a card to Primary. */
export function WorktreeUnassignDialog(props: WorktreeUnassignDialogProps) {
    const { busy, commitMessage, onClose, onCommitMessageChange, onCommitPush, onDrop, open } = props
    const handleMessageChange = (event: ChangeEvent<HTMLInputElement>) => onCommitMessageChange(event.target.value)
    const handleCommitPush = async () => onCommitPush(commitMessage)

    return (
        <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
            <DialogTitle>Worktree has uncommitted changes</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <DialogContentText>
                    Commit and push changes before returning this worktree to its parked state,
                    or permanently drop all tracked and untracked changes.
                </DialogContentText>
                <Typography color="text.secondary">Commit message</Typography>
                <TextField autoFocus disabled={busy} onChange={handleMessageChange} size="small" value={commitMessage} />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button color="error" disabled={busy} onClick={onDrop}>Drop changes</Button>
                <Button disabled={busy || commitMessage.trim().length === 0} onClick={handleCommitPush} variant="contained">
                    Commit & push
                </Button>
            </DialogActions>
        </Dialog>
    )
}
