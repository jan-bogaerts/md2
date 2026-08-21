import { MenuItem, Stack } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useEffect } from 'react'
import {
    PERMISSION_MODE_OPTIONS,
    findAgentProfile,
    mergeAgentProfiles,
    supportsPermissionMode,
    validatePermissionMode,
    validateThinkingLevel,
} from '../../../data/agent_profiles'
import {
    projectAgentSelection,
    selectAgent,
    selectModel,
    selectPermissionMode,
    selectThinkingLevel,
} from '../../../data/agent_selection'
import type { RawActionDefinition } from '../../../data/action_types'
import { agentCapabilitiesService, type AgentCapabilitiesService } from '../../../services/agents/agent_capabilities_service'
import { actionAgentSelectionDraftService } from '../../../services/actions/action_agent_selection_draft_service'
import { useAgentCapabilities } from '../../hooks/use_agent_capabilities'
import { useConfigValue } from '../../hooks/use_config_value'
import { ActionEditorField } from '../editor/action_editor_field'
import { ActionSectionLabel } from '../shared/action_section_label'

interface ActionAgentCapabilityFieldsProps {
    definition: RawActionDefinition
    errors: Partial<Record<keyof RawActionDefinition, string>>
    onChange: (definition: RawActionDefinition) => void
    service?: AgentCapabilitiesService
    sourcePath: string
}

export function ActionAgentCapabilityFields(props: ActionAgentCapabilityFieldsProps) {
    const { definition, errors, onChange, service = agentCapabilitiesService, sourcePath } = props
    const profiles = mergeAgentProfiles(useConfigValue('desktop.agentProfiles'))
    const desktopSelection = useConfigValue('desktop.agentSelection')
    const selection = actionAgentSelectionDraftService.getSelection(sourcePath, definition, desktopSelection, profiles)
    const { availability, models, thinkingLevels } = useAgentCapabilities(service)
    const selectedProfile = definition.agent ? findAgentProfile(profiles, definition.agent) : null

    useEffect(() => {
        if (definition.agent) void service.loadModels(definition.agent)
        else service.clear()
    }, [definition.agent, service])

    useEffect(() => {
        if (definition.agent && definition.model) {
            void service.loadThinkingLevels(definition.agent, definition.model)
        }
    }, [definition.agent, definition.model, service])

    useEffect(() => () => {
        actionAgentSelectionDraftService.clearSelection(sourcePath)
    }, [sourcePath])

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
        const agent = event.target.value
        if (!agent) {
            onChange({ ...definition, agent: undefined, model: undefined, permissionMode: undefined, thinkingLevel: undefined })
            return
        }
        const nextSelection = selectAgent(selection, agent, profiles, [desktopSelection])
        const projected = projectAgentSelection(nextSelection)
        actionAgentSelectionDraftService.setSelection(sourcePath, nextSelection)
        onChange({ ...definition, agent: projected.agent, model: projected.model, thinkingLevel: projected.thinkingLevel })
    }

    const handleModelChange = (event: ChangeEvent<HTMLInputElement>) => {
        const model = event.target.value
        if (!model) return
        const nextSelection = selectModel(selection, model)
        actionAgentSelectionDraftService.setSelection(sourcePath, nextSelection)
        onChange({ ...definition, model, thinkingLevel: nextSelection.settingsByAgent[nextSelection.activeAgent].thinkingLevel })
    }

    const handleThinkingLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        const thinkingLevel = validateThinkingLevel(event.target.value, 'action thinkingLevel')
        const nextSelection = selectThinkingLevel(selection, thinkingLevel)
        actionAgentSelectionDraftService.setSelection(sourcePath, nextSelection)
        onChange({ ...definition, thinkingLevel })
    }

    const handlePermissionModeChange = (event: ChangeEvent<HTMLInputElement>) => {
        const permissionMode = event.target.value
            ? validatePermissionMode(event.target.value, 'action permissionMode')
            : undefined
        if (permissionMode) {
            actionAgentSelectionDraftService.setSelection(sourcePath, selectPermissionMode(selection, permissionMode))
        }
        onChange({ ...definition, permissionMode })
    }

    const selectedAvailability = definition.agent ? availability.values[definition.agent] : undefined
    const agentCapabilityError = availability.error
        ?? (definition.agent && !availability.loading && !selectedAvailability
            ? `Agent executable availability is missing for ${definition.agent}`
            : selectedAvailability?.error)

    const modelValues = definition.model && !models.values.includes(definition.model)
        ? [definition.model, ...models.values]
        : models.values
    const configuredThinkingLevels = thinkingLevels.values.filter((level) => level !== 'none')
    const thinkingLevelValues = definition.thinkingLevel && !configuredThinkingLevels.includes(definition.thinkingLevel)
        ? [definition.thinkingLevel, ...configuredThinkingLevels]
        : configuredThinkingLevels

    return (
        <Stack
            aria-labelledby="action-agent-override-heading"
            component="section"
            spacing={1.5}
            sx={{ bgcolor: 'background.default', border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
        >
            <ActionSectionLabel component="h3" id="action-agent-override-heading">Agent override</ActionSectionLabel>
            <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
                <ActionEditorField
                    error={!!errors.agent || !!agentCapabilityError}
                    fieldId="action-agent"
                    fullWidth
                    helperText={errors.agent ?? agentCapabilityError ?? (availability.loading ? 'Checking agent availability…' : undefined)}
                    label="Agent"
                    onChange={handleAgentChange}
                    select
                    size="small"
                    value={definition.agent ?? ''}
                >
                    <MenuItem value="">Application default</MenuItem>
                    {profiles.map((profile) => {
                        const profileAvailability = availability.values[profile.name]
                        const disabled = availability.loading || !!availability.error || !profileAvailability?.available
                        const label = profileAvailability?.error ? `${profile.name} — ${profileAvailability.error}` : profile.name

                        return <MenuItem disabled={disabled} key={profile.name} value={profile.name}>{label}</MenuItem>
                    })}
                </ActionEditorField>
                <ActionEditorField
                    disabled={!definition.agent || models.loading || !!models.error}
                    error={!!errors.model || !!models.error}
                    fieldId="action-model"
                    fullWidth
                    helperText={errors.model ?? models.error ?? (models.loading ? 'Loading models…' : undefined)}
                    label="Model"
                    onChange={handleModelChange}
                    select
                    size="small"
                    value={definition.model ?? ''}
                >
                    <MenuItem value="">Select model</MenuItem>
                    {modelValues.map((model) => (
                        <MenuItem key={model} value={model}>
                            {model === definition.model && !models.loading && !models.values.includes(model) ? `${model} — unavailable` : model}
                        </MenuItem>
                    ))}
                </ActionEditorField>
                <ActionEditorField
                    disabled={!definition.agent || !definition.model || thinkingLevels.loading || !!thinkingLevels.error}
                    error={!!errors.thinkingLevel || !!thinkingLevels.error}
                    fieldId="action-thinking-level"
                    fullWidth
                    helperText={errors.thinkingLevel ?? thinkingLevels.error ?? (thinkingLevels.loading ? 'Loading thinking levels…' : undefined)}
                    label="Thinking level"
                    onChange={handleThinkingLevelChange}
                    select
                    size="small"
                    value={definition.thinkingLevel ?? 'none'}
                >
                    <MenuItem value="none">none</MenuItem>
                    {thinkingLevelValues.map((level) => (
                        <MenuItem key={level} value={level}>
                            {level === definition.thinkingLevel && !thinkingLevels.loading && !configuredThinkingLevels.includes(level)
                                ? `${level} — unavailable`
                                : level}
                        </MenuItem>
                    ))}
                </ActionEditorField>
                <ActionEditorField
                    disabled={!definition.agent || !selectedProfile || !supportsPermissionMode(selectedProfile)}
                    error={!!errors.permissionMode}
                    fieldId="action-permission-mode"
                    fullWidth
                    helperText={errors.permissionMode ?? (
                        definition.agent && selectedProfile && !supportsPermissionMode(selectedProfile)
                            ? `${definition.agent} does not support permission modes.`
                            : PERMISSION_MODE_OPTIONS.find(({ value }) => value === definition.permissionMode)?.description
                    )}
                    label="Permission mode"
                    onChange={handlePermissionModeChange}
                    select
                    size="small"
                    value={definition.permissionMode ?? ''}
                >
                    <MenuItem value="">Application default</MenuItem>
                    {PERMISSION_MODE_OPTIONS.map(({ label, value }) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                    ))}
                </ActionEditorField>
            </Stack>
        </Stack>
    )
}
