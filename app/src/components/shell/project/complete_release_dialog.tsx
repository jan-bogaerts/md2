import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import type { ReleaseBranchCandidate } from '../../../data/data_types'
import { ReleaseBranchCheckbox } from './release_branch_checkbox'

interface CompleteReleaseDialogProps {
    branchCandidates: ReleaseBranchCandidate[]
    defaultIncludeProjectActivity: boolean
    defaultSelectAll: boolean
    isLoading: boolean
    open: boolean
    onClose: () => void
    onCompleteRelease: (releaseName: string, selectedBranchNames: string[], includeProjectActivity: boolean) => Promise<void>
    onIncludeProjectActivityChange: (included: boolean) => void
    onSelectAllDefaultChange: (selected: boolean) => void
}

/** Dialog for confirming and naming release completion. */
export function CompleteReleaseDialog(props: CompleteReleaseDialogProps) {
    const {
        branchCandidates,
        defaultIncludeProjectActivity,
        defaultSelectAll,
        isLoading,
        onClose,
        onCompleteRelease,
        onIncludeProjectActivityChange,
        onSelectAllDefaultChange,
        open,
    } = props
    const [releaseName, setReleaseName] = useState('')
    const [includeProjectActivity, setIncludeProjectActivity] = useState(defaultIncludeProjectActivity)
    const [selectedBranchNames, setSelectedBranchNames] = useState<Set<string>>(
        defaultSelectAll ? new Set(branchCandidates.map(({ branchName }) => branchName)) : new Set(),
    )

    const handleReleaseNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setReleaseName(event.target.value)
    }

    const handleCompleteClick = async () => {
        if (releaseName.length === 0) return

        const selectedBranches = branchCandidates
            .map(({ branchName }) => branchName)
            .filter((branchName) => selectedBranchNames.has(branchName))
        await onCompleteRelease(releaseName, selectedBranches, includeProjectActivity)
        setReleaseName('')
    }
    const handleIncludeProjectActivityChange = (event: ChangeEvent<HTMLInputElement>) => {
        setIncludeProjectActivity(event.target.checked)
        onIncludeProjectActivityChange(event.target.checked)
    }
    const handleBranchChange = (branchName: string, checked: boolean) => {
        const nextSelectedBranchNames = new Set(selectedBranchNames)
        if (checked) nextSelectedBranchNames.add(branchName)
        else nextSelectedBranchNames.delete(branchName)
        setSelectedBranchNames(nextSelectedBranchNames)
    }
    const handleSelectAll = () => {
        setSelectedBranchNames(new Set(branchCandidates.map(({ branchName }) => branchName)))
        onSelectAllDefaultChange(true)
    }
    const handleClearAll = () => {
        setSelectedBranchNames(new Set())
        onSelectAllDefaultChange(false)
    }

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
            <DialogTitle>Complete release</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField label="Release name" onChange={handleReleaseNameChange} size="small" value={releaseName} />
                    <FormControlLabel
                        control={(
                            <Checkbox
                                checked={includeProjectActivity}
                                disabled={isLoading}
                                onChange={handleIncludeProjectActivityChange}
                                size="small"
                            />
                        )}
                        label="Include project agent activity"
                    />
                    {branchCandidates.length > 0 ? (
                        <Stack spacing={1}>
                            <Typography color="text.secondary">Delete local branches</Typography>
                            <Stack direction="row" spacing={1}>
                                <Button disabled={isLoading} onClick={handleSelectAll} size="small">Select all</Button>
                                <Button disabled={isLoading} onClick={handleClearAll} size="small">Clear all</Button>
                            </Stack>
                            {branchCandidates.map((candidate) => (
                                <ReleaseBranchCheckbox
                                    candidate={candidate}
                                    checked={selectedBranchNames.has(candidate.branchName)}
                                    disabled={isLoading}
                                    key={candidate.branchName}
                                    onChange={handleBranchChange}
                                />
                            ))}
                        </Stack>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button disabled={releaseName.length === 0 || isLoading} onClick={handleCompleteClick} variant="contained">
                    Complete release
                </Button>
            </DialogActions>
        </Dialog>
    )
}
