import {
    Divider, FormControlLabel, FormHelperText, MenuItem, Paper, Stack, Switch, Grid,
} from '@mui/material'
import type { ChangeEvent, MouseEvent } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import type { WorktreeRecord } from '../../data/data_types'
import { ActionAgentCapabilityFields } from './action_agent_capability_fields'
import { ActionEditorField } from './action_editor_field'
import { ActionFilterEditor } from './action_filter_editor'
import { ActionLinkListEditor } from './action_link_list_editor'
import { ActionOnRulesEditor } from './action_on_rules_editor'
import { ActionSectionLabel } from './action_section_label'

const ICON_FILE_PATTERN = /\.(svg|png|jpe?g|gif|webp)$/iu

interface ActionDefinitionFieldsProps {
    actions: ActionDefinition[]
    cardTypes: string[]
    definition: RawActionDefinition
    errorIndex: number | null
    errors: Partial<Record<keyof RawActionDefinition, string>>
    onChange: (definition: RawActionDefinition) => void
    onCommit: () => void
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
    worktrees: WorktreeRecord[]
}

export function ActionDefinitionFields(props: ActionDefinitionFieldsProps) {
    const {
        actions, cardTypes, definition, errorIndex, errors, onChange, onCommit, repositoryFiles,
        specialContextTypes, states, worktrees,
    } = props
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
            trackFileChanges: undefined,
            type: 'command',
        })
    }

    const handleNeedsWorkTreeChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...definition, needsWorkTree: event.target.checked || undefined })
    }

    const handleTrackFileChangesChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...definition, trackFileChanges: event.target.checked || undefined })
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

    const handleClick = (event: MouseEvent<HTMLElement>) => {
        if (event.target instanceof Element && event.target.closest('button')) onCommit()
    }

    return (
        <Paper onBlur={onCommit} onClick={handleClick} variant="outlined" sx={{ maxWidth: 720, mb: 2, p: 2.5 }}>
            <Stack spacing={2}>
                <ActionSectionLabel component="h2">Action definition</ActionSectionLabel>
                <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
                    <ActionEditorField error={!!errors.label} fieldId="action-label" fullWidth helperText={errors.label} label="Label" name="label" onChange={handleRequiredTextChange} size="small" value={definition.label} />
                    <ActionEditorField
                        error={!!errors.type}
                        fieldId="action-type"
                        fullWidth
                        helperText={errors.type}
                        label="Type"
                        onChange={handleTypeChange}
                        select
                        size="small"
                        value={definition.type}
                    >
                        <MenuItem value="agent">Agent</MenuItem>
                        <MenuItem value="command">Command</MenuItem>
                    </ActionEditorField>
                    <ActionEditorField error={!!errors.icon} fieldId="action-icon" fullWidth helperText={errors.icon} label="Icon" name="icon" onChange={handleOptionalTextChange} select size="small" value={definition.icon ?? ''}>
                        <MenuItem value="">No icon</MenuItem>
                        {iconPaths.map((path) => <MenuItem key={path} value={path}>{path}</MenuItem>)}
                    </ActionEditorField>
                </Stack>
                <ActionEditorField error={!!errors.description} fieldId="action-description" fullWidth helperText={errors.description} label="Description" name="description" onChange={handleRequiredTextChange} size="small" value={definition.description} />
                <Divider />
                <Grid
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { md: 'repeat(3, 1fr)', xs: '1fr' },
                        columnGap: 2,
                        alignItems: 'start',
                        mt: { md: 2.75 },
                    }}
                >
                    <ActionEditorField
                        error={!!errors.onState}
                        fieldId="action-on-state"
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
                    </ActionEditorField>

                    <Stack>
                        <FormControlLabel
                            control={<Switch checked={!!definition.needsWorkTree} onChange={handleNeedsWorkTreeChange} size="small" />}
                            label="Needs worktree"
                            sx={{ whiteSpace: 'nowrap' }}
                        />
                        <FormHelperText>card needs to be assigned to a worktree</FormHelperText>
                    </Stack>
                    {definition.type === 'agent' ? (
                        <Stack>
                            <FormControlLabel
                                control={<Switch checked={!!definition.trackFileChanges} onChange={handleTrackFileChangesChange} size="small" />}
                                label="Auto commit"
                                sx={{ whiteSpace: 'nowrap' }}
                            />
                            <FormHelperText error={!!errors.trackFileChanges}>
                                {errors.trackFileChanges ?? 'auto commit files agent reported as modified'}
                            </FormHelperText>
                        </Stack>
                    ) : null}
                </Grid>
                {definition.type === 'agent' ? (
                    <ActionAgentCapabilityFields definition={definition} errors={errors} onChange={onChange} />
                ) : (
                    <ActionEditorField
                        error={!!errors.command}
                        fieldId="action-command"
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
                <Divider />
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
                <Divider />
                <ActionLinkListEditor
                    actions={actions}
                    emptyText="No actions run before this one."
                    error={errors.onBefore}
                    errorIndex={errorIndex}
                    label="Before"
                    onChange={handleOnBeforeChange}
                    value={definition.onBefore}
                />
                <Divider />
                <ActionOnRulesEditor
                    actions={actions}
                    error={errors.on}
                    errorIndex={errorIndex}
                    onChange={handleOnChange}
                    value={definition.on}
                />
                <Divider />
                <ActionLinkListEditor
                    actions={actions}
                    emptyText="No actions run after this one."
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
