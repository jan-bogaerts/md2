import { Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import ArrowDown from 'mdi-material-ui/ArrowDown'
import ArrowUp from 'mdi-material-ui/ArrowUp'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import type { ChangeEvent, MouseEvent } from 'react'
import type { ActionDefinition } from '../../data/action_types'

interface ActionLinkListEditorProps {
    actions: ActionDefinition[]
    error?: string
    label: string
    onChange: (actionIds: string[] | undefined) => void
    value: string[] | undefined
}

export function ActionLinkListEditor(props: ActionLinkListEditorProps) {
    const { actions, error, label, onChange, value = [] } = props

    const handleAdd = () => {
        const action = actions.find(({ id }) => !value.includes(id))
        if (action) onChange([...value, action.id])
    }

    const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        onChange(value.map((actionId, actionIndex) => actionIndex === index ? event.target.value : actionId))
    }

    const handleMove = (event: MouseEvent<HTMLButtonElement>) => {
        const index = Number.parseInt(event.currentTarget.dataset.index ?? '', 10)
        const offset = event.currentTarget.dataset.direction === 'up' ? -1 : 1
        const targetIndex = index + offset
        if (targetIndex < 0 || targetIndex >= value.length) return
        const next = [...value]
        const current = next[index]
        next[index] = next[targetIndex]
        next[targetIndex] = current
        onChange(next)
    }

    const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
        const index = Number.parseInt(event.currentTarget.dataset.index ?? '', 10)
        const next = value.filter((_actionId, actionIndex) => actionIndex !== index)
        onChange(next.length > 0 ? next : undefined)
    }

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">{label}</Typography>
            {value.map((actionId, index) => (
                <Box key={`${actionId}:${index}`} sx={{ alignItems: 'flex-start', display: 'flex', gap: 0.5 }}>
                    <TextField
                        error={!!error}
                        fullWidth
                        helperText={index === 0 ? error : undefined}
                        label="Action"
                        name={String(index)}
                        onChange={handleSelect}
                        select
                        size="small"
                        value={actionId}
                    >
                        {actions.map((action) => <MenuItem key={action.id} value={action.id}>{action.label}</MenuItem>)}
                    </TextField>
                    <IconButton aria-label={`Move ${label} action up`} data-direction="up" data-index={index} disabled={index === 0} onClick={handleMove} size="small"><ArrowUp fontSize="small" /></IconButton>
                    <IconButton aria-label={`Move ${label} action down`} data-direction="down" data-index={index} disabled={index === value.length - 1} onClick={handleMove} size="small"><ArrowDown fontSize="small" /></IconButton>
                    <IconButton aria-label={`Remove ${label} action`} data-index={index} onClick={handleRemove} size="small"><DeleteOutline fontSize="small" /></IconButton>
                </Box>
            ))}
            <Button disabled={!actions.some(({ id }) => !value.includes(id))} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>Add action</Button>
        </Stack>
    )
}
