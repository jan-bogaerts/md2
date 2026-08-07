import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    TextField,
    Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'

interface WorktreeIntegrationDialogProps {
    busy: boolean
    commitMessage: string | null
    deleteBranch: boolean
    onClose: () => void
    onCommitMessageChange: (message: string) => void
    onDeleteBranchChange: (deleteBranch: boolean) => void
    onIntegrate: () => Promise<void>
    open: boolean
}

/** Confirms card worktree integration and optional local branch cleanup. */
export function WorktreeIntegrationDialog(props: WorktreeIntegrationDialogProps) {
    const {
        busy,
        commitMessage,
        deleteBranch,
        onClose,
        onCommitMessageChange,
        onDeleteBranchChange,
        onIntegrate,
        open,
    } = props
    const handleCommitMessageChange = (event: ChangeEvent<HTMLInputElement>) => onCommitMessageChange(event.target.value)
    const handleDeleteBranchChange = (event: ChangeEvent<HTMLInputElement>) => onDeleteBranchChange(event.target.checked)
    const integrateDisabled = busy || commitMessage !== null && commitMessage.trim().length === 0

    return (
        <Dialog fullWidth maxWidth="xs" onClose={busy ? undefined : onClose} open={open}>
            <DialogTitle>Integrate into project</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <DialogContentText>Squash-merge card changes into project branch.</DialogContentText>
                {commitMessage !== null ? (
                    <>
                        <Typography color="text.secondary">Commit message</Typography>
                        <TextField
                            autoFocus
                            disabled={busy}
                            onChange={handleCommitMessageChange}
                            size="small"
                            value={commitMessage}
                        />
                    </>
                ) : null}
                <FormControlLabel
                    control={<Checkbox checked={deleteBranch} disabled={busy} onChange={handleDeleteBranchChange} />}
                    label="Delete branch"
                />
            </DialogContent>
            <DialogActions>
                <Button disabled={busy} onClick={onClose}>Cancel</Button>
                <Button disabled={integrateDisabled} onClick={onIntegrate} variant="contained">Integrate</Button>
            </DialogActions>
        </Dialog>
    )
}
