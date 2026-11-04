import { Button, MenuItem, Stack } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useEffect } from 'react'
import {
    PERMISSION_MODE_OPTIONS,
    findAgentProfile,
    mergeAgentProfiles,
    supportsPermissionMode,
    validatePermissionMode,
    validateThinkingLevel,
    SPEED_MODE_OPTIONS,
    supportsThinkingLevel,
    THINKING_LEVELS,
    validateSpeedMode,
} from '../../../data/agent_profiles'
import {
    projectAgentSelection,
    selectAccount,
    selectAgent,
    selectModel,
    selectPermissionMode,
    selectThinkingLevel,
    selectSpeedMode,
} from '../../../data/agent_selection'
import { initialAgentAccountId, supportsAgentAccounts } from '../../../data/agent_accounts'
import type { RawActionDefinition } from '../../../data/action_types'
import { agentCapabilitiesService, type AgentCapabilitiesService } from '../../../services/agents/agent_capabilities_service'
import { actionAgentSelectionDraftService } from '../../../services/actions/action_agent_selection_draft_service'
import { useAgentCapabilities } from '../../hooks/use_agent_capabilities'
import { useConfigValue } from '../../hooks/use_config_value'
import { useAgentModelCatalog } from '../../hooks/use_agent_model_catalog';
import { agentModelOptions } from '../../../data/agent_model_options';
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
    const accounts = useConfigValue('desktop.agentAccounts')
    const selection = actionAgentSelectionDraftService.getSelection(sourcePath, definition, desktopSelection, profiles)
    const { availability } = useAgentCapabilities(service)
    const selectedProfile = definition.agent ? findAgentProfile(profiles, definition.agent) : null
    const selectedAgentAccounts = accounts.filter(({ agent, kind }) => agent === definition.agent && kind !== 'initial')
    const accountAvailable = !definition.accountId
        || definition.accountId === initialAgentAccountId(definition.agent ?? '')
        || selectedAgentAccounts.some(({ id }) => id === definition.accountId)
    const models = useAgentModelCatalog(selectedProfile, definition.accountId, service);
    const modelOptions = agentModelOptions(models.catalog, definition.model ?? '');
    const configuredThinkingLevels: string[] = THINKING_LEVELS
        .filter((level) => level === 'none' || (!!selectedProfile && supportsThinkingLevel(selectedProfile, level)));
    const thinkingLevelValues = definition.thinkingLevel && !configuredThinkingLevels.includes(definition.thinkingLevel)
        ? [definition.thinkingLevel, ...configuredThinkingLevels] : configuredThinkingLevels;

    useEffect(() => () => {
        actionAgentSelectionDraftService.clearSelection(sourcePath)
    }, [sourcePath])

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
        const agent = event.target.value
        if (!agent) {
            const clearedDefinition = {
                ...definition,
                accountId: undefined,
                agent: undefined,
                model: undefined,
                permissionMode: undefined,
                thinkingLevel: undefined,
                speedMode: undefined,
            };
            onChange(clearedDefinition);
            return
        }
        const nextSelection = selectAgent(selection, agent, profiles, [desktopSelection])
        const projected = projectAgentSelection(nextSelection, profiles)
        actionAgentSelectionDraftService.setSelection(sourcePath, nextSelection)
        onChange({
            ...definition, agent: projected.agent, model: projected.model, thinkingLevel: projected.thinkingLevel,
            accountId: supportsAgentAccounts(projected.agent) ? projected.accountId : undefined,
            speedMode: projected.agent === 'codex' ? projected.speedMode : undefined,
        });
    }

    const handleAccountChange = (event: ChangeEvent<HTMLInputElement>) => {
        const accountId = event.target.value || undefined
        const nextSelection = selectAccount(selection, accountId, accounts)
        actionAgentSelectionDraftService.setSelection(sourcePath, nextSelection)
        onChange({ ...definition, accountId })
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

    const handleSpeedModeChange = (event: ChangeEvent<HTMLInputElement>) => {
        const speedMode = event.target.value ? validateSpeedMode(event.target.value, 'action speedMode') : undefined;
        const nextSelection = speedMode !== undefined ? selectSpeedMode(selection, speedMode) : {
            ...selection,
            settingsByAgent: {
                ...selection.settingsByAgent,
                [selection.activeAgent]: { ...selection.settingsByAgent[selection.activeAgent], speedMode: undefined },
            },
        };
        actionAgentSelectionDraftService.setSelection(sourcePath, nextSelection);
        onChange({ ...definition, speedMode });
    };

    const selectedAvailability = definition.agent ? availability.values[definition.agent] : undefined
    const agentCapabilityError = availability.error
        ?? (definition.agent && !availability.loading && !selectedAvailability
            ? `Agent executable availability is missing for ${definition.agent}`
            : selectedAvailability?.error)

    return (
        <Stack
            aria-labelledby="action-agent-override-heading"
            component="section"
            spacing={1.5}
            sx={{ bgcolor: 'background.default', border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
        >
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <ActionSectionLabel component="h4" id="action-agent-override-heading">Agent override</ActionSectionLabel>
                <Button disabled={!selectedProfile || models.loading} onClick={models.refresh} size="small">Refresh models</Button>
            </Stack>
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
                    disabled={!definition.agent}
                    error={!!errors.model}
                    fieldId="action-model"
                    fullWidth
                    helperText={errors.model ?? models.error}
                    label="Model"
                    onChange={handleModelChange}
                    select
                    size="small"
                    value={definition.model ?? ''}
                >
                    <MenuItem value="">Select model</MenuItem>
                    {modelOptions.map(({ displayName, id }) => (
                        <MenuItem key={id} value={id}>
                            {displayName}
                        </MenuItem>
                    ))}
                </ActionEditorField>
                <ActionEditorField
                    disabled={!definition.agent || !definition.model}
                    error={!!errors.thinkingLevel}
                    fieldId="action-thinking-level"
                    fullWidth
                    helperText={errors.thinkingLevel}
                    label="Thinking level"
                    onChange={handleThinkingLevelChange}
                    select
                    size="small"
                    value={definition.thinkingLevel ?? 'none'}
                >
                    {thinkingLevelValues.map((level) => (
                        <MenuItem disabled={!configuredThinkingLevels.includes(level)} key={level} value={level}>
                            {level === definition.thinkingLevel && !configuredThinkingLevels.includes(level)
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
            {definition.agent === 'codex' ? (
                <ActionEditorField
                    error={!!errors.speedMode}
                    fieldId="action-speed-mode"
                    helperText={errors.speedMode ?? 'Fast uses higher provider usage. Application default inherits the global preference.'}
                    label="Speed"
                    onChange={handleSpeedModeChange}
                    select
                    size="small"
                    value={definition.speedMode ?? ''}
                >
                    <MenuItem value="">Application default</MenuItem>
                    {SPEED_MODE_OPTIONS.map(({ label, value }) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                    ))}
                </ActionEditorField>
            ) : null}
            {definition.agent && supportsAgentAccounts(definition.agent) ? <ActionEditorField
                error={!!errors.accountId}
                fieldId="action-account"
                fullWidth
                helperText={errors.accountId ?? (!accountAvailable ? `Removed account ${definition.accountId}; the default is used.` : undefined)}
                label="Account"
                onChange={handleAccountChange}
                select
                size="small"
                value={definition.accountId === initialAgentAccountId(definition.agent) ? '' : definition.accountId ?? ''}
            >
                <MenuItem value="">Initial</MenuItem>
                {!accountAvailable ? (
                    <MenuItem disabled value={definition.accountId}>{definition.accountId} — uses default</MenuItem>
                ) : null}
                {selectedAgentAccounts.map(({ id, name }) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
            </ActionEditorField> : null}
        </Stack>
    )
}
