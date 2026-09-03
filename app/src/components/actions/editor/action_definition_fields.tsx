import {
    Divider, FormControlLabel, FormHelperText, MenuItem, Paper, Stack, Switch, Grid,
} from '@mui/material'
import type { ChangeEvent, MouseEvent } from 'react'
import { memo, useEffect, useState } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../../data/action_types'
import type { WorktreeRecord } from '../../../data/data_types'
import {
    ACTION_DRAFT_CHANGED_EVENT,
    actionService,
    type ActionDraftChangedDetail,
} from '../../../services/actions/action_service'
import { useProjectState } from '../../hooks/use_project_state'
import { ActionAgentCapabilityFields } from '../agent/action_agent_capability_fields'
import { ActionEditorField } from './action_editor_field'
import { ActionFilterEditor } from './action_filter_editor'
import { ActionLinkListEditor } from './action_link_list_editor'
import { ActionOnRulesEditor } from './action_on_rules_editor'
import { ActionSectionLabel } from '../shared/action_section_label'
import { ActionEditorTextField } from './action_editor_text_field'

const ICON_FILE_PATTERN = /\.(svg|png|jpe?g|gif|webp)$/iu
const EMPTY_REPOSITORY_FILES: string[] = []

interface ActionDefinitionFieldsProps {
    actionId: string
    actions: ActionDefinition[]
    cardTypes: string[]
    sourcePath: string
    specialContextTypes: string[]
    states: string[]
    worktrees: WorktreeRecord[]
}

export const ActionDefinitionFields = memo(function ActionDefinitionFields(props: ActionDefinitionFieldsProps) {
    const {
        actionId, actions, cardTypes, sourcePath,
        specialContextTypes, states, worktrees,
    } = props
    const { snapshot } = useProjectState()
    const repositoryFiles = snapshot?.repositoryFiles ?? EMPTY_REPOSITORY_FILES
    const [, setDraftRevision] = useState(0)
    useEffect(() => {
        let previousDraft = actionService.draftStore.getDraft(actionId)
        const handleChanged = (event: Event) => {
            const { actionId: changedActionId } = (event as CustomEvent<ActionDraftChangedDetail>).detail
            if (changedActionId !== actionId) return

            const nextDraft = actionService.draftStore.getDraft(actionId)
            if (nextDraft === previousDraft) return

            previousDraft = nextDraft
            setDraftRevision((current) => current + 1)
        }
        actionService.addEventListener(ACTION_DRAFT_CHANGED_EVENT, handleChanged)

        return () => actionService.removeEventListener(ACTION_DRAFT_CHANGED_EVENT, handleChanged)
    }, [actionId])
    const { definition, validation } = actionService.draftStore.getDraft(actionId)
    const errors = validation.error && validation.field ? { [validation.field]: validation.error } : {}
    const errorIndex = validation.index
    const selectableActions = actions.filter(({ id }) => id !== definition.id)
    // `stageDraft` deliberately fires no events, so controls that render straight from the
    // draft (selects, switches, list editors) need a local revision bump to show the new value.
    const handleDefinitionChange = (nextDefinition: RawActionDefinition) => {
        actionService.draftStore.stageDraft(actionId, nextDefinition)
        setDraftRevision((current) => current + 1)
    }
    /** Staging without a re-render, for fields that keep their own keystroke state. */
    const stageDefinition = (nextDefinition: RawActionDefinition) => {
        actionService.draftStore.stageDraft(actionId, nextDefinition)
    }
    const handleDefinitionCommit = () => actionService.draftStore.commitDraft(actionId)
    const iconPaths = repositoryFiles.filter((path) => ICON_FILE_PATTERN.test(path))
    if (definition.icon && !iconPaths.includes(definition.icon)) iconPaths.unshift(definition.icon)
    const missingState = definition.onState && !states.includes(definition.onState) ? definition.onState : null
    const onStateHelperText = errors.onState ?? (missingState
        ? `State "${missingState}" no longer exists. This trigger cannot run until cleared or replaced.`
        : undefined)

    // label/description/command are ActionEditorTextField: keystrokes already render locally.
    const handleRequiredTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        stageDefinition({ ...definition, [event.target.name]: event.target.value })
    }

    const handleOptionalTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        handleDefinitionChange({ ...definition, [event.target.name]: event.target.value || undefined })
    }

    const handleTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.value === 'agent') {
            handleDefinitionChange({
                ...definition,
                command: undefined,
                prompt: definition.prompt ?? '',
                showCommandWindow: undefined,
                type: 'agent',
            })
            return
        }

        handleDefinitionChange({
            ...definition,
            agent: undefined,
            autoFinish: undefined,
            command: definition.command ?? '',
            model: undefined,
            permissionMode: undefined,
            prompt: undefined,
            thinkingLevel: undefined,
            trackFileChanges: undefined,
            streaming: undefined,
            type: 'command',
        })
    }

    const handleOutputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const output = event.target.value === 'diagram' ? { kind: 'diagram' as const } : undefined
        const autoFinish = definition.autoFinish?.when === 'diagram-created' && !output
            ? undefined
            : definition.autoFinish
        handleDefinitionChange({ ...definition, autoFinish, output })
    }

    const handleNeedsWorkTreeChange = (event: ChangeEvent<HTMLInputElement>) => {
        handleDefinitionChange({ ...definition, needsWorkTree: event.target.checked || undefined })
    }

    const handleTrackFileChangesChange = (event: ChangeEvent<HTMLInputElement>) => {
        handleDefinitionChange({ ...definition, trackFileChanges: event.target.checked || undefined })
    }

    const handleShowCommandWindowChange = (event: ChangeEvent<HTMLInputElement>) => {
        handleDefinitionChange({ ...definition, showCommandWindow: event.target.checked || undefined })
    }

    const handleStreamingChange = (event: ChangeEvent<HTMLInputElement>) => {
        handleDefinitionChange({
            ...definition,
            autoFinish: event.target.checked ? definition.autoFinish : undefined,
            streaming: event.target.checked || undefined,
        })
    }

    const handleAutoFinishChange = (event: ChangeEvent<HTMLInputElement>) => {
        handleDefinitionChange({
            ...definition,
            autoFinish: event.target.checked
                ? definition.output?.kind === 'diagram'
                    ? { when: 'diagram-created' }
                    : { state: states[0], when: 'card-state' }
                : undefined,
        })
    }

    const handleAutoFinishTriggerChange = (event: ChangeEvent<HTMLInputElement>) => {
        const autoFinish = event.target.value === 'diagram-created'
            ? { when: 'diagram-created' as const }
            : { state: states[0], when: 'card-state' as const }
        handleDefinitionChange({ ...definition, autoFinish })
    }

    const handleAutoFinishStateChange = (event: ChangeEvent<HTMLInputElement>) => {
        handleDefinitionChange({ ...definition, autoFinish: { state: event.target.value, when: 'card-state' } })
    }

    const handleFiltersChange = (appliesTo: RawActionDefinition['appliesTo']) => {
        handleDefinitionChange({ ...definition, appliesTo })
    }

    const handleOnBeforeChange = (onBefore: string[] | undefined) => {
        handleDefinitionChange({ ...definition, onBefore })
    }

    const handleOnChange = (on: RawActionDefinition['on']) => {
        handleDefinitionChange({ ...definition, on })
    }

    const handleOnAfterChange = (onAfter: string[] | undefined) => {
        handleDefinitionChange({ ...definition, onAfter })
    }

    const handleClick = (event: MouseEvent<HTMLElement>) => {
        if (event.target instanceof Element && event.target.closest('button')) handleDefinitionCommit()
    }

    return (
        <Paper onBlur={handleDefinitionCommit} onClick={handleClick} variant="outlined" sx={{ maxWidth: 720, mb: 2, p: 2.5 }}>
            <Stack spacing={2}>
                <ActionSectionLabel component="h2">Action definition</ActionSectionLabel>
                <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
                    <ActionEditorTextField error={!!errors.label} fieldId="action-label" fullWidth helperText={errors.label} label="Label" name="label" onChange={handleRequiredTextChange} size="small" source={definition} value={definition.label} />
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
                    <ActionEditorField
                        error={!!errors.output}
                        fieldId="action-output-kind"
                        fullWidth
                        helperText={errors.output}
                        label="Output kind"
                        onChange={handleOutputChange}
                        select
                        size="small"
                        value={definition.output?.kind ?? ''}
                    >
                        <MenuItem value="">Regular</MenuItem>
                        <MenuItem value="diagram">Diagram</MenuItem>
                    </ActionEditorField>
                    <ActionEditorField error={!!errors.icon} fieldId="action-icon" fullWidth helperText={errors.icon} label="Icon" name="icon" onChange={handleOptionalTextChange} select size="small" value={definition.icon ?? ''}>
                        <MenuItem value="">No icon</MenuItem>
                        {iconPaths.map((path) => <MenuItem key={path} value={path}>{path}</MenuItem>)}
                    </ActionEditorField>
                </Stack>
                <ActionEditorTextField error={!!errors.description} fieldId="action-description" fullWidth helperText={errors.description} label="Description" name="description" onChange={handleRequiredTextChange} size="small" source={definition} value={definition.description} />
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
                        <>
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
                            <Stack>
                                <FormControlLabel
                                    control={<Switch checked={!!definition.streaming} onChange={handleStreamingChange} size="small" />}
                                    label="Streaming"
                                    sx={{ whiteSpace: 'nowrap' }}
                                />
                                <FormHelperText error={!!errors.streaming}>
                                    {errors.streaming ?? 'keep agent session open for more turns'}
                                </FormHelperText>
                            </Stack>
                            {definition.streaming ? (
                                <Stack>
                                    <FormControlLabel
                                        control={(
                                            <Switch
                                                checked={!!definition.autoFinish}
                                                disabled={states.length === 0 && definition.output?.kind !== 'diagram'}
                                                onChange={handleAutoFinishChange}
                                                size="small"
                                            />
                                        )}
                                        label="Auto finish"
                                        sx={{ whiteSpace: 'nowrap' }}
                                    />
                                    <FormHelperText error={!!errors.autoFinish}>
                                        {errors.autoFinish ?? 'finish when configured output condition occurs'}
                                    </FormHelperText>
                                </Stack>
                            ) : null}
                        </>
                    ) : (
                        <Stack>
                            <FormControlLabel
                                control={(
                                    <Switch
                                        checked={!!definition.showCommandWindow}
                                        onChange={handleShowCommandWindowChange}
                                        size="small"
                                    />
                                )}
                                label="Show command window"
                                sx={{ whiteSpace: 'nowrap' }}
                            />
                            <FormHelperText>open a console window for command interaction</FormHelperText>
                        </Stack>
                    )}
                </Grid>
                {definition.type === 'agent' && definition.streaming && definition.autoFinish ? (
                    <ActionEditorField
                        error={!!errors.autoFinish}
                        fieldId="action-auto-finish-trigger"
                        fullWidth
                        helperText={errors.autoFinish}
                        label="Auto finish trigger"
                        onChange={handleAutoFinishTriggerChange}
                        select
                        size="small"
                        value={definition.autoFinish.when}
                    >
                        {states.length > 0 ? <MenuItem value="card-state">When card enters state</MenuItem> : null}
                        {definition.output?.kind === 'diagram' ? <MenuItem value="diagram-created">When diagram is created</MenuItem> : null}
                    </ActionEditorField>
                ) : null}
                {definition.type === 'agent' && definition.streaming && definition.autoFinish?.when === 'card-state' ? (
                    <ActionEditorField
                        error={!!errors.autoFinish}
                        fieldId="action-auto-finish-state"
                        fullWidth
                        helperText={errors.autoFinish}
                        label="Auto finish card state"
                        onChange={handleAutoFinishStateChange}
                        select
                        size="small"
                        value={definition.autoFinish.state}
                    >
                        {states.map((state) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
                    </ActionEditorField>
                ) : null}
                {definition.type === 'agent' ? (
                    <ActionAgentCapabilityFields
                        definition={definition}
                        errors={errors}
                        onChange={handleDefinitionChange}
                        sourcePath={sourcePath}
                    />
                ) : (
                    <ActionEditorTextField
                        error={!!errors.command}
                        fieldId="action-command"
                        fullWidth
                        helperText={errors.command}
                        label="Command"
                        minRows={2}
                        multiline
                        name="command"
                        onChange={handleRequiredTextChange}
                        source={definition}
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
                    actions={selectableActions}
                    emptyText="No actions run before this one."
                    error={errors.onBefore}
                    errorIndex={errorIndex}
                    label="Before"
                    onChange={handleOnBeforeChange}
                    value={definition.onBefore}
                />
                <Divider />
                <ActionOnRulesEditor
                    actions={selectableActions}
                    error={errors.on}
                    errorIndex={errorIndex}
                    onChange={handleOnChange}
                    value={definition.on}
                />
                <Divider />
                <ActionLinkListEditor
                    actions={selectableActions}
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
})
