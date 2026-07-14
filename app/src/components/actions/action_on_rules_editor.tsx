import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, Button, FormHelperText, IconButton, MenuItem, Stack, Tooltip, Typography } from '@mui/material'
import type { ChangeEvent, MouseEvent } from 'react'
import type { ActionDefinition, RawOnRule } from '../../data/action_types'
import { ActionEditorField } from './action_editor_field'

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
                <Box
                    aria-label={`Output rule ${index + 1}`}
                    key={`${rule.actionId}:${index}`}
                    role="group"
                    sx={{
                        alignItems: 'start',
                        display: 'grid',
                        gap: 0.5,
                        gridTemplateColumns: { sm: 'minmax(0, 1fr) minmax(0, 1fr) auto', xs: 'minmax(0, 1fr)' },
                        minWidth: 0,
                        '&:focus-within .action-row-actions, &:hover .action-row-actions': { opacity: 1 },
                    }}
                >
                    <ActionEditorField
                        error={hasIndexedError && errorIndex === index}
                        fieldId={`action-output-condition-${index}`}
                        helperText={hasIndexedError && errorIndex === index ? error : undefined}
                        label="Regular expression"
                        name={`condition:${index}`}
                        onChange={handleChange}
                        size="small"
                        value={rule.condition}
                    />
                    <ActionEditorField fieldId={`action-output-action-${index}`} label="Action" name={`actionId:${index}`} onChange={handleChange} select size="small" value={rule.actionId}>
                        {!actions.some(({ id }) => id === rule.actionId) ? (
                            <MenuItem value={rule.actionId}>{rule.actionId} — unavailable</MenuItem>
                        ) : null}
                        {actions.map((action) => <MenuItem key={action.id} value={action.id}>{action.label}</MenuItem>)}
                    </ActionEditorField>
                    <Box className="action-row-actions" sx={{ display: 'flex', justifyContent: 'flex-end', opacity: 0 }}>
                        <Tooltip title="Move output rule up">
                            <span>
                                <IconButton aria-label="Move output rule up" data-direction="up" data-index={index} disabled={index === 0} onClick={handleMove} size="small" sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}>
                                    <ArrowUpwardOutlined fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Move output rule down">
                            <span>
                                <IconButton aria-label="Move output rule down" data-direction="down" data-index={index} disabled={index === value.length - 1} onClick={handleMove} size="small" sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}>
                                    <ArrowDownwardOutlined fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Remove output rule">
                            <IconButton aria-label="Remove output rule" data-index={index} onClick={handleRemove} size="small" sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}>
                                <DeleteOutlineOutlined fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            ))}
            <Button disabled={actions.length === 0} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }} variant="outlined">Add output rule</Button>
        </Stack>
    )
}
