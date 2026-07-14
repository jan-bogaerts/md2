import {
    Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import type { WorktreeRecord } from '../../data/data_types'
import { ActionAgentCapabilityFields } from './action_agent_capability_fields'
import { ActionFilterEditor } from './action_filter_editor'
import { ActionLinkListEditor } from './action_link_list_editor'
import { ActionOnRulesEditor } from './action_on_rules_editor'

const ICON_FILE_PATTERN = /\.(svg|png|jpe?g|gif|webp)$/iu

interface ActionDefinitionFieldsProps {
    actions: ActionDefinition[]
    cardTypes: string[]
    definition: RawActionDefinition
    errorIndex: number | null
    errors: Partial<Record<keyof RawActionDefinition, string>>
    onChange: (definition: RawActionDefinition) => void
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
    worktrees: WorktreeRecord[]
}

export function ActionDefinitionFields(props: ActionDefinitionFieldsProps) {
    const {actions, cardTypes, definition, errorIndex, errors, onChange, repositoryFiles, specialContextTypes, states, worktrees} = props
    const iconPaths = repositoryFiles.filter((path) => ICON_FILE_PATTERN.test(path))
    if (definition.icon && !iconPaths.includes(definition.icon)) iconPaths.unshift(definition.icon)
    const missingState = definition.onState && !states.includes(definition.onState) ? definition.onState : null
    const onStateHelperText = errors.onState ?? (missingState
        ? `State "${missingState}" no longer exists. This trigger cannot run until cleared or replaced.`
        : undefined)

    const handleRequiredTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...definition, [event.target.name]: event.target.value })
    }

    const handleOptionalTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...definition, [event.target.name]: event.target.value || undefined })
    }

    const handleTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.value === 'agent') {
            onChange({ ...definition, command: undefined, prompt: definition.prompt ?? '', type: 'agent' })
            return
        }

        onChange({
            ...definition,
            agent: undefined,
            command: definition.command ?? '',
            model: undefined,
            prompt: undefined,
            thinkingLevel: undefined,
            type: 'command',
        })
    }

    const handleNeedsWorkTreeChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...definition, needsWorkTree: event.target.checked || undefined })
    }

    const handleFiltersChange = (appliesTo: RawActionDefinition['appliesTo']) => {
        onChange({ ...definition, appliesTo })
    }

    const handleOnBeforeChange = (onBefore: string[] | undefined) => {
        onChange({ ...definition, onBefore })
    }

    const handleOnChange = (on: RawActionDefinition['on']) => {
        onChange({ ...definition, on })
    }

    const handleOnAfterChange = (onAfter: string[] | undefined) => {
        onChange({ ...definition, onAfter })
    }

    return (
        <Paper variant="outlined" sx={{ mb: 2, p: 2 }}>
            <Stack spacing={2}>
                <Typography component="h2" variant="h6">Action definition</Typography>
                <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
                    <TextField disabled fullWidth label="ID" size="small" value={definition.id} />
                    <TextField error={!!errors.type} fullWidth helperText={errors.type} label="Type" onChange={handleTypeChange} select size="small" value={definition.type}>
                        <MenuItem value="agent">Agent</MenuItem>
                        <MenuItem value="command">Command</MenuItem>
                    </TextField>
                </Stack>
                <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
                    <TextField error={!!errors.name} fullWidth helperText={errors.name} label="Name" name="name" onChange={handleRequiredTextChange} size="small" value={definition.name} />
                    <TextField error={!!errors.label} fullWidth helperText={errors.label} label="Label" name="label" onChange={handleRequiredTextChange} size="small" value={definition.label} />
                </Stack>
                <TextField error={!!errors.description} fullWidth helperText={errors.description} label="Description" name="description" onChange={handleRequiredTextChange} size="small" value={definition.description} />
                <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
                    <TextField error={!!errors.icon} fullWidth helperText={errors.icon} label="Icon" name="icon" onChange={handleOptionalTextChange} select size="small" value={definition.icon ?? ''}>
                        <MenuItem value="">No icon</MenuItem>
                        {iconPaths.map((path) => <MenuItem key={path} value={path}>{path}</MenuItem>)}
                    </TextField>
                    <TextField
                        error={!!errors.onState}
                        fullWidth
                        helperText={onStateHelperText}
                        label="Run when card enters state"
                        name="onState"
                        onChange={handleOptionalTextChange}
                        select
                        size="small"
                        value={definition.onState ?? ''}
                    >
                        <MenuItem value="">No state trigger</MenuItem>
                        {missingState ? <MenuItem value={missingState}>{missingState} — unavailable</MenuItem> : null}
                        {states.map((state) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
                    </TextField>
                    <FormControlLabel
                        control={<Checkbox checked={!!definition.needsWorkTree} onChange={handleNeedsWorkTreeChange} />}
                        label="Needs worktree"
                    />
                </Stack>
                {definition.type === 'agent' ? (
                    <ActionAgentCapabilityFields definition={definition} errors={errors} onChange={onChange} />
                ) : (
                    <TextField
                        error={!!errors.command}
                        fullWidth
                        helperText={errors.command}
                        label="Command"
                        minRows={2}
                        multiline
                        name="command"
                        onChange={handleRequiredTextChange}
                        value={definition.command ?? ''}
                    />
                )}
                <ActionFilterEditor
                    cardTypes={cardTypes}
                    error={errors.appliesTo}
                    onChange={handleFiltersChange}
                    repositoryFiles={repositoryFiles}
                    specialContextTypes={specialContextTypes}
                    states={states}
                    value={definition.appliesTo}
                    worktrees={worktrees}
                />
                <ActionLinkListEditor
                    actions={actions}
                    error={errors.onBefore}
                    errorIndex={errorIndex}
                    label="Before"
                    onChange={handleOnBeforeChange}
                    value={definition.onBefore}
                />
                <ActionOnRulesEditor
                    actions={actions}
                    error={errors.on}
                    errorIndex={errorIndex}
                    onChange={handleOnChange}
                    value={definition.on}
                />
                <ActionLinkListEditor
                    actions={actions}
                    error={errors.onAfter}
                    errorIndex={errorIndex}
                    label="After"
                    onChange={handleOnAfterChange}
                    value={definition.onAfter}
                />
            </Stack>
        </Paper>
    )
}
