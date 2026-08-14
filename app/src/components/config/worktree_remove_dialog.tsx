import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import type { WorktreeRecord } from '../../data/data_types'

interface WorktreeRemoveDialogProps {
    disabled: boolean
    onClose: () => void
    onConfirm: () => void
    record: WorktreeRecord | null
}

export function WorktreeRemoveDialog(props: WorktreeRemoveDialogProps) {
    const { disabled, onClose, onConfirm, record } = props

    return (
        <Dialog onClose={disabled ? undefined : onClose} open={record !== null}>
            <DialogTitle>Remove linked worktree?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Git will remove the checkout folder {record?.path} after Save. The branch will remain.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button disabled={disabled} onClick={onClose}>Cancel</Button>
                <Button color="error" disabled={disabled} onClick={onConfirm} variant="contained">Remove</Button>
            </DialogActions>
        </Dialog>
    )
}
