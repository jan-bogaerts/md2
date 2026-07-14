import { Box, Button, FormHelperText, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import ArrowDown from 'mdi-material-ui/ArrowDown'
import ArrowUp from 'mdi-material-ui/ArrowUp'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import type { ChangeEvent, MouseEvent } from 'react'
import type { ActionDefinition, RawOnRule } from '../../data/action_types'

interface ActionOnRulesEditorProps {
    actions: ActionDefinition[]
    error?: string
    errorIndex?: number | null
    onChange: (rules: RawOnRule[] | undefined) => void
    value: RawOnRule[] | undefined
}

export function ActionOnRulesEditor(props: ActionOnRulesEditorProps) {
    const { actions, error, errorIndex, onChange, value = [] } = props
    const hasIndexedError = !!error && errorIndex !== null && errorIndex !== undefined
    const showSectionError = !!error && (!hasIndexedError || value[errorIndex] === undefined)

    const handleAdd = () => {
        const action = actions[0]
        if (action) onChange([...value, { actionId: action.id, condition: '' }])
    }

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const [field, rawIndex] = event.target.name.split(':')
        const index = Number.parseInt(rawIndex, 10)
        const rule = value[index]
        if (!rule) throw new Error(`Missing on rule at index ${index}`)
        onChange(value.map((candidate, ruleIndex) => ruleIndex === index ? { ...candidate, [field]: event.target.value } : candidate))
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
        const next = value.filter((_rule, ruleIndex) => ruleIndex !== index)
        onChange(next.length > 0 ? next : undefined)
    }

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">Output rules</Typography>
            {/* Section-level error so it shows even when the collection has no rendered rows. */}
            {showSectionError ? <FormHelperText error>{error}</FormHelperText> : null}
            {value.map((rule, index) => (
                <Box key={`${rule.actionId}:${index}`} sx={{ alignItems: 'flex-start', display: 'flex', gap: 0.5 }}>
                    <TextField
                        error={hasIndexedError && errorIndex === index}
                        helperText={hasIndexedError && errorIndex === index ? error : undefined}
                        label="Regular expression"
                        name={`condition:${index}`}
                        onChange={handleChange}
                        size="small"
                        value={rule.condition}
                    />
                    <TextField label="Action" name={`actionId:${index}`} onChange={handleChange} select size="small" value={rule.actionId}>
                        {actions.map((action) => <MenuItem key={action.id} value={action.id}>{action.label}</MenuItem>)}
                    </TextField>
                    <IconButton aria-label="Move output rule up" data-direction="up" data-index={index} disabled={index === 0} onClick={handleMove} size="small"><ArrowUp fontSize="small" /></IconButton>
                    <IconButton aria-label="Move output rule down" data-direction="down" data-index={index} disabled={index === value.length - 1} onClick={handleMove} size="small"><ArrowDown fontSize="small" /></IconButton>
                    <IconButton aria-label="Remove output rule" data-index={index} onClick={handleRemove} size="small"><DeleteOutline fontSize="small" /></IconButton>
                </Box>
            ))}
            <Button disabled={actions.length === 0} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>Add output rule</Button>
        </Stack>
    )
}
