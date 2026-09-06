import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    Radio,
    RadioGroup,
} from '@mui/material'
import { useState } from 'react'
import type { WorktreeRecord, WorktreeRemovalMode } from '../../data/data_types'

interface WorktreeRemoveDialogProps {
    disabled: boolean
    onClose: () => void
    onConfirm: (mode: WorktreeRemovalMode) => void
    record: WorktreeRecord | null
}

const REMOVAL_MODE_OPTIONS: { label: string, mode: WorktreeRemovalMode }[] = [
    { label: 'Delete the folder and everything in it', mode: 'folder' },
    { label: 'Keep the folder, delete everything in it', mode: 'files' },
    { label: 'Keep the folder and everything in it', mode: 'unregister' },
]

export function WorktreeRemoveDialog(props: WorktreeRemoveDialogProps) {
    const { disabled, onClose, onConfirm, record } = props
    const [mode, setMode] = useState<WorktreeRemovalMode>('folder')
    const [openedRecord, setOpenedRecord] = useState(record)
    const stale = record !== null && !record.valid
    // Each worktree opens the dialog on the default disposition rather than on whatever the previous one chose.
    if (record !== openedRecord) {
        setOpenedRecord(record)
        if (record) setMode('folder')
    }

    const handleConfirm = () => {
        onConfirm(stale ? 'folder' : mode)
    }

    return (
        <Dialog onClose={disabled ? undefined : onClose} open={record !== null}>
            <DialogTitle>Remove linked worktree?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {stale
                        ? `The folder ${record?.path} is no longer a usable worktree. Save removes its stale Git registration only; nothing on disk is touched.`
                        : `Git stops tracking ${record?.path} as a linked worktree after Save. The branch will remain. Choose what happens to the folder on disk:`}
                </DialogContentText>
                {stale ? null : (
                    <RadioGroup
                        aria-label="Worktree folder disposition"
                        name="worktree-removal-mode"
                        onChange={(event) => setMode(event.target.value as WorktreeRemovalMode)}
                        sx={{ mt: 1 }}
                        value={mode}
                    >
                        {REMOVAL_MODE_OPTIONS.map((option) => (
                            <FormControlLabel
                                control={<Radio disabled={disabled} size="small" />}
                                key={option.mode}
                                label={option.label}
                                value={option.mode}
                            />
                        ))}
                    </RadioGroup>
                )}
            </DialogContent>
            <DialogActions>
                <Button disabled={disabled} onClick={onClose}>Cancel</Button>
                <Button color="error" disabled={disabled} onClick={handleConfirm} variant="contained">Remove</Button>
            </DialogActions>
        </Dialog>
    )
}
