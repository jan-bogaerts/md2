import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { BranchReference } from '../../../data/data_types'

interface BranchSwitchDialogProps {
    branches: BranchReference[]
    isLoading: boolean
    open: boolean
    selectedBranch: string
    onBranchChange: (branch: string) => void
    onClose: () => void
    onSwitchBranch: (branch: string) => void
}

/** Dialog for switching the currently open project branch. */
export function BranchSwitchDialog(props: BranchSwitchDialogProps) {
    const { branches, isLoading, onBranchChange, onClose, onSwitchBranch, open, selectedBranch } = props

    const handleBranchChange = (event: SelectChangeEvent) => {
        onBranchChange(event.target.value)
    }

    const handleSwitchClick = () => {
        onSwitchBranch(selectedBranch)
    }

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
            <DialogTitle>Switch branch</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <FormControl disabled={branches.length === 0 || isLoading} size="small">
                        <InputLabel id="switch-branch-label">Branch</InputLabel>
                        <Select label="Branch" labelId="switch-branch-label" onChange={handleBranchChange} value={selectedBranch}>
                            {branches.map(({ name }) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button disabled={selectedBranch.length === 0 || isLoading} onClick={handleSwitchClick} variant="contained">
                    Switch
                </Button>
            </DialogActions>
        </Dialog>
    )
}
