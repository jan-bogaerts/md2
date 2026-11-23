import {
    Alert,
    Button,
    Checkbox,
    CircularProgress,
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
import type { CardWorktreeOperationPhase } from '../services/project/worktree_service'

interface WorktreeIntegrationDialogProps {
    commitMessage: string | null
    deleteBranch: boolean
    onClose: () => void
    onCommitMessageChange: (message: string) => void
    onDeleteBranchChange: (deleteBranch: boolean) => void
    onIntegrate: () => Promise<void>
    open: boolean
    phase: CardWorktreeOperationPhase | null
}

const PHASE_FEEDBACK: Record<CardWorktreeOperationPhase, { actionLabel: string; progressLabel: string; text: string }> = {
    committing: {
        actionLabel: 'Committing...',
        progressLabel: 'Committing worktree changes',
        text: 'Committing worktree changes...',
    },
    finalizing: {
        actionLabel: 'Finishing...',
        progressLabel: 'Finalizing card state',
        text: 'Finalizing card state...',
    },
    generic: {
        actionLabel: 'Integrating...',
        progressLabel: 'Preparing worktree operation',
        text: 'Preparing worktree operation...',
    },
    integrating: {
        actionLabel: 'Integrating...',
        progressLabel: 'Integrating worktree into project',
        text: 'Integrating worktree into project...',
    },
    savingProjectChanges: {
        actionLabel: 'Integrating...',
        progressLabel: 'Saving pending project edits',
        text: 'Saving pending project edits...',
    },
}

/** Confirms card worktree integration and optional local branch cleanup. */
export function WorktreeIntegrationDialog(props: WorktreeIntegrationDialogProps) {
    const {
        commitMessage,
        deleteBranch,
        onClose,
        onCommitMessageChange,
        onDeleteBranchChange,
        onIntegrate,
        open,
        phase,
    } = props
    const busy = phase !== null
    const feedback = phase === null ? null : PHASE_FEEDBACK[phase]
    const handleCommitMessageChange = (event: ChangeEvent<HTMLInputElement>) => onCommitMessageChange(event.target.value)
    const handleDeleteBranchChange = (event: ChangeEvent<HTMLInputElement>) => onDeleteBranchChange(event.target.checked)
    const integrateDisabled = busy || commitMessage !== null && commitMessage.trim().length === 0

    return (
        <Dialog fullWidth maxWidth="xs" onClose={busy ? undefined : onClose} open={open}>
            <DialogTitle>Integrate into project</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <DialogContentText>Squash-merge card changes into project branch.</DialogContentText>
                {feedback ? (
                    <Alert icon={<CircularProgress aria-label={feedback.progressLabel} size={20} />} severity="info">
                        {feedback.text}
                    </Alert>
                ) : null}
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
                <Button
                    disabled={integrateDisabled}
                    onClick={onIntegrate}
                    startIcon={feedback ? <CircularProgress aria-hidden="true" color="inherit" size={16} /> : undefined}
                    variant="contained"
                >
                    {feedback?.actionLabel ?? 'Integrate'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
