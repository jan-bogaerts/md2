import { Checkbox, FormControlLabel } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ReleaseBranchCandidate } from '../../../data/data_types'

interface ReleaseBranchCheckboxProps {
    candidate: ReleaseBranchCandidate
    checked: boolean
    disabled: boolean
    onChange: (branchName: string, checked: boolean) => void
}

/** One release branch selection row. */
export function ReleaseBranchCheckbox(props: ReleaseBranchCheckboxProps) {
    const { candidate, checked, disabled, onChange } = props
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(candidate.branchName, event.target.checked)

    return (
        <FormControlLabel
            control={<Checkbox checked={checked} disabled={disabled} onChange={handleChange} />}
            label={`${candidate.cardId} — ${candidate.branchName}`}
        />
    )
}
