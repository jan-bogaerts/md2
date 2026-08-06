import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel } from '@mui/material'
import type { ChangeEvent } from 'react'

interface WorktreeIntegrationDialogProps {
    busy: boolean
    deleteBranch: boolean
    onClose: () => void
    onDeleteBranchChange: (deleteBranch: boolean) => void
    onIntegrate: () => Promise<void>
    open: boolean
}

/** Confirms card worktree integration and optional local branch cleanup. */
export function WorktreeIntegrationDialog(props: WorktreeIntegrationDialogProps) {
    const { busy, deleteBranch, onClose, onDeleteBranchChange, onIntegrate, open } = props
    const handleDeleteBranchChange = (event: ChangeEvent<HTMLInputElement>) => onDeleteBranchChange(event.target.checked)

    return (
        <Dialog fullWidth maxWidth="xs" onClose={busy ? undefined : onClose} open={open}>
            <DialogTitle>Integrate into project</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <DialogContentText>Squash-merge card changes into project branch.</DialogContentText>
                <FormControlLabel
                    control={<Checkbox checked={deleteBranch} disabled={busy} onChange={handleDeleteBranchChange} />}
                    label="Delete branch"
                />
            </DialogContent>
            <DialogActions>
                <Button disabled={busy} onClick={onClose}>Cancel</Button>
                <Button disabled={busy} onClick={onIntegrate} variant="contained">Integrate</Button>
            </DialogActions>
        </Dialog>
    )
}
