import { MenuItem } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ActionDefinition } from '../../../data/action_types'
import { ActionEditorField } from './action_editor_field'

interface ActionSelectorFieldProps {
    actions: ActionDefinition[]
    error?: string
    fieldId: string
    name: string
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
    value: string
}

/** Action-id selector that keeps stale persisted ids visible. */
export function ActionSelectorField(props: ActionSelectorFieldProps) {
    const { actions, error, fieldId, name, onChange, value } = props

    return (
        <ActionEditorField
            error={!!error}
            fieldId={fieldId}
            fullWidth
            helperText={error}
            label="Action"
            name={name}
            onChange={onChange}
            select
            size="small"
            value={value}
        >
            {!actions.some(({ id }) => id === value) ? <MenuItem value={value}>{value} — unavailable</MenuItem> : null}
            {actions.map((action) => <MenuItem key={action.id} value={action.id}>{action.label}</MenuItem>)}
        </ActionEditorField>
    )
}
