import { Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import type { ChangeEvent, MouseEvent } from 'react'
import type { ActionAppliesTo } from '../../data/action_types'

const FILTER_FIELDS = ['kind', 'type', 'state', 'file', 'folder', 'worktree']

interface ActionFilterEditorProps {
    error?: string
    onChange: (filters: ActionAppliesTo | undefined) => void
    value: ActionAppliesTo | undefined
}

export function ActionFilterEditor(props: ActionFilterEditorProps) {
    const { error, onChange, value } = props
    const entries = Object.entries(value ?? {})

    const handleAdd = () => {
        const field = FILTER_FIELDS.find((candidate) => !Object.hasOwn(value ?? {}, candidate))
        if (!field) return
        onChange({ ...value, [field]: '' })
    }

    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        const previousField = entries[index]?.[0]
        if (!previousField) throw new Error(`Missing applicability filter at index ${index}`)
        const nextEntries = entries.map(([field, fieldValue], entryIndex) => (
            entryIndex === index ? [event.target.value, fieldValue] : [field, fieldValue]
        ))
        onChange(Object.fromEntries(nextEntries))
    }

    const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        const field = entries[index]?.[0]
        if (!field) throw new Error(`Missing applicability filter at index ${index}`)
        onChange({ ...value, [field]: event.target.value })
    }

    const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
        const index = Number.parseInt(event.currentTarget.dataset.index ?? '', 10)
        const nextEntries = entries.filter((_entry, entryIndex) => entryIndex !== index)
        onChange(nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined)
    }

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">Applicability filters</Typography>
            {entries.map(([field, fieldValue], index) => (
                <Box key={field} sx={{ alignItems: 'flex-start', display: 'flex', gap: 1 }}>
                    <TextField
                        label="Context field"
                        name={String(index)}
                        onChange={handleFieldChange}
                        select
                        size="small"
                        value={field}
                    >
                        {FILTER_FIELDS.map((option) => (
                            <MenuItem
                                disabled={Object.hasOwn(value ?? {}, option) && option !== field}
                                key={option}
                                value={option}
                            >
                                {option}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        error={!!error}
                        helperText={index === 0 ? error : undefined}
                        label="Required value"
                        name={String(index)}
                        onChange={handleValueChange}
                        size="small"
                        value={fieldValue}
                    />
                    <IconButton aria-label={`Remove ${field} filter`} data-index={index} onClick={handleRemove} size="small">
                        <DeleteOutline fontSize="small" />
                    </IconButton>
                </Box>
            ))}
            <Button disabled={entries.length >= FILTER_FIELDS.length} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>Add filter</Button>
        </Stack>
    )
}
