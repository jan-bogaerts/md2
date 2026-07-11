import { Box, Chip, FormControl, MenuItem, Select, Tooltip, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { BranchReference } from '../../../data/data_types'

interface BranchMenuSelectProps {
    branches: BranchReference[]
    disabled: boolean
    onChange: (event: SelectChangeEvent) => void
    onOpen: () => void
    value: string
}

function BranchValue(props: { branch: string }) {
    const { branch } = props

    return (
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, minWidth: 0 }}>
            <Box sx={{ bgcolor: 'success.main', borderRadius: '50%', flexShrink: 0, height: 8, width: 8 }} />
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{branch}</Typography>
            <Chip
                label="branch"
                size="small"
                sx={{ bgcolor: 'action.selected', color: 'text.secondary', fontSize: 10.5, height: 20 }}
            />
        </Box>
    )
}

/** Rich branch selector used in the project toolbar group. */
export function BranchMenuSelect(props: BranchMenuSelectProps) {
    const { branches, disabled, onChange, onOpen, value } = props

    return (
        <Tooltip title="Switch branch">
            <FormControl size="small" sx={{ minWidth: 180 }}>
                <Select
                    aria-label="Switch branch"
                    disabled={disabled}
                    onChange={onChange}
                    onOpen={onOpen}
                    renderValue={(branch) => <BranchValue branch={branch} />}
                    size="small"
                    sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        height: 34,
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                    }}
                    value={value}
                >
                    {branches.map((branch) => (
                        <MenuItem key={branch.name} value={branch.name}>{branch.name}</MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Tooltip>
    )
}
