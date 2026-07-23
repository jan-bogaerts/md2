import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'

interface WorktreeCommitDialogProps {
    action: 'commit' | 'integrate' | 'update'
    busy: boolean
    message: string
    onClose: () => void
    onCommit: (message: string) => Promise<void>
    onMessageChange: (message: string) => void
    open: boolean
}

/** Collects a commit message for one card worktree operation. */
export function WorktreeCommitDialog(props: WorktreeCommitDialogProps) {
    const { action, busy, message, onClose, onCommit, onMessageChange, open } = props
    const handleMessageChange = (event: ChangeEvent<HTMLInputElement>) => onMessageChange(event.target.value)
    const handleCommit = async () => onCommit(message)
    const actionLabel = action === 'integrate' ? 'Commit & integrate' : action === 'update' ? 'Commit & update' : 'Commit'
    const title = action === 'integrate'
        ? 'Commit and integrate worktree'
        : action === 'update' ? 'Commit and update worktree' : 'Commit worktree'

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <Typography color="text.secondary">Commit message</Typography>
                <TextField autoFocus disabled={busy} onChange={handleMessageChange} size="small" value={message} />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button disabled={busy || message.trim().length === 0} onClick={handleCommit} variant="contained">
                    {actionLabel}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
