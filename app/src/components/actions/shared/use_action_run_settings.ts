import { useSyncExternalStore } from 'react'
import type { ActionDefinition } from '../../../data/action_types'
import {
    defaultModelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    validateThinkingLevel,
} from '../../../data/agent_profiles'
import { hasActionRunBackend } from '../../../data/electron_action_bridge'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { useAgentCapabilities } from '../../hooks/use_agent_capabilities'
import { useConfigValueOrFallback } from '../../hooks/use_config_value'

function optionAvailable(value: string, options: string[]) {
    return value.length === 0 || options.includes(value)
}

/** Resolve agent input and backend state only for controls that consume it. */
export function useActionRunSettings(action: ActionDefinition, store: ActionRunSettingsStore) {
    const configuredAgent = useConfigValueOrFallback('desktop.agent', '')
    const configuredAccessLevel = useConfigValueOrFallback('desktop.accessLevel', '')
    const configuredApprovalPolicy = useConfigValueOrFallback('desktop.approvalPolicy', '')
    const configuredAgentProfiles = useConfigValueOrFallback('desktop.agentProfiles', [])
    const configuredModel = useConfigValueOrFallback('desktop.model', '')
    const configuredThinkingLevel = useConfigValueOrFallback('desktop.thinkingLevel', 'none')
    const capabilities = useAgentCapabilities()
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const agentProfiles = mergeAgentProfiles(configuredAgentProfiles)
    const defaultAgent = action.agent ?? configuredAgent
    const defaultAgentProfile = findAgentProfile(agentProfiles, defaultAgent)
    const defaultModel = (action.model ?? configuredModel)
        || (defaultAgentProfile ? defaultModelForProfile(defaultAgentProfile) : '')
    const savedSettings = snapshot.settings
    const savedProfile = savedSettings ? findAgentProfile(agentProfiles, savedSettings.agent) : undefined
    const savedAgentAvailable = savedSettings?.agent === '' || (
        !!savedSettings
        && !!savedProfile
        && !!capabilities.availability.values[savedSettings.agent]?.available
        && !capabilities.availability.error
    )
    const savedSettingsAvailable = !!savedSettings
        && savedAgentAvailable
        && optionAvailable(savedSettings.model, savedProfile?.models ?? [])
        && optionAvailable(savedSettings.accessLevel, savedProfile?.accessLevels ?? [])
        && optionAvailable(savedSettings.approvalPolicy, savedProfile?.approvalPolicies ?? [])
    const effectiveSavedSettings = savedSettingsAvailable ? savedSettings : null
    const agent = effectiveSavedSettings?.agent ?? defaultAgent
    const model = effectiveSavedSettings?.model ?? defaultModel
    const selectedAgentProfile = findAgentProfile(agentProfiles, agent)
    const selectedAgentModels = selectedAgentProfile?.models ?? []
    const selectedAccessLevels = selectedAgentProfile?.accessLevels ?? []
    const selectedApprovalPolicies = selectedAgentProfile?.approvalPolicies ?? []
    const selectedAvailability = capabilities.availability.values[agent]
    const selectedAgentAvailable = action.type !== 'agent'
        || (!!selectedAvailability?.available && !capabilities.availability.error)
    const backendAvailable = hasActionRunBackend()
    const runDisabledMessage = snapshot.loading
        ? 'Loading saved action settings'
        : snapshot.loadError
            ? `Could not load saved action settings: ${snapshot.loadError}`
            : !backendAvailable
                ? 'Action run requires the Electron desktop app'
                : action.type === 'agent' && capabilities.availability.loading
                    ? 'Checking agent executable availability'
                    : action.type === 'agent' && !selectedAgentAvailable
                        ? selectedAvailability?.error ?? capabilities.availability.error ?? `Agent executable is unavailable for ${agent}`
                        : null
    const definitionThinkingLevel = validateThinkingLevel(
        action.thinkingLevel ?? configuredThinkingLevel,
        `action "${action.label}"`,
    )
    const thinkingLevel = effectiveSavedSettings?.thinkingLevel ?? definitionThinkingLevel
    const accessLevel = selectedAgentProfile?.accessLevels
        ? effectiveSavedSettings?.accessLevel ?? action.accessLevel ?? configuredAccessLevel
        : action.accessLevel ?? ''
    const approvalPolicy = selectedAgentProfile?.approvalPolicies
        ? effectiveSavedSettings?.approvalPolicy ?? action.approvalPolicy ?? configuredApprovalPolicy
        : action.approvalPolicy ?? ''

    return {
        accessLevel,
        agent,
        agentAvailability: capabilities.availability.values,
        agentProfiles,
        approvalPolicy,
        backendAvailable,
        model,
        runDisabledMessage,
        selectedAgentAvailable,
        selectedAgentModels,
        selectedAccessLevels,
        selectedApprovalPolicies,
        settingsChangedWhileWaiting: snapshot.settingsChangedWhileWaiting,
        settingsLoading: snapshot.loading,
        thinkingLevel,
    }
}
