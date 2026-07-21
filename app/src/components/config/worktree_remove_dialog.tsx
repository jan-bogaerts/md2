import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import type { WorktreeRecord } from '../../data/data_types'

interface WorktreeRemoveDialogProps {
    onClose: () => void
    onConfirm: () => void
    record: WorktreeRecord | null
}

export function WorktreeRemoveDialog(props: WorktreeRemoveDialogProps) {
    const { onClose, onConfirm, record } = props

    return (
        <Dialog onClose={onClose} open={record !== null}>
            <DialogTitle>Remove linked worktree?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Git will remove the checkout folder {record?.path}. The branch will remain.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button color="error" onClick={onConfirm} variant="contained">Remove</Button>
            </DialogActions>
        </Dialog>
    )
}
