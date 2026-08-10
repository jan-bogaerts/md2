import { useSyncExternalStore } from 'react'
import type { ActionDefinition } from '../../../data/action_types'
import {
    PERMISSION_MODES,
    defaultModelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    supportsPermissionMode,
    validateThinkingLevel,
} from '../../../data/agent_profiles'
import { hasActionRunBackend } from '../../../data/electron_action_bridge'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { useAgentCapabilities } from '../../hooks/use_agent_capabilities'
import { useConfigValueOrFallback, useHasDesktopConfig } from '../../hooks/use_config_value'

function optionAvailable(value: string, options: string[]) {
    return value.length === 0 || options.includes(value)
}

/** Resolve agent input and backend state only for controls that consume it. */
export function useActionRunSettings(action: ActionDefinition, store: ActionRunSettingsStore) {
    const configuredAgent = useConfigValueOrFallback('desktop.agent', '')
    const configuredAgentProfiles = useConfigValueOrFallback('desktop.agentProfiles', [])
    const configuredModel = useConfigValueOrFallback('desktop.model', '')
    const configuredPermissionMode = useConfigValueOrFallback('desktop.permissionMode', 'ask-for-approval')
    const configuredThinkingLevel = useConfigValueOrFallback('desktop.thinkingLevel', 'none')
    const desktopConfigAvailable = useHasDesktopConfig()
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
        && (savedProfile && supportsPermissionMode(savedProfile)
            ? PERMISSION_MODES.some((permissionMode) => permissionMode === savedSettings.permissionMode)
            : savedSettings.permissionMode === '')
    const effectiveSavedSettings = savedSettingsAvailable ? savedSettings : null
    const agent = effectiveSavedSettings?.agent ?? defaultAgent
    const model = effectiveSavedSettings?.model ?? defaultModel
    const selectedAgentProfile = findAgentProfile(agentProfiles, agent)
    const selectedAgentModels = selectedAgentProfile?.models ?? []
    const permissionModeSupported = !!selectedAgentProfile && supportsPermissionMode(selectedAgentProfile)
    const selectedAvailability = capabilities.availability.values[agent]
    const selectedAgentAvailable = action.type !== 'agent'
        || (!!selectedAvailability?.available && !capabilities.availability.error)
    const backendAvailable = hasActionRunBackend()
    const runDisabledMessage = snapshot.loading
        ? 'Loading saved action settings'
        : snapshot.loadError
            ? `Could not load saved action settings: ${snapshot.loadError}`
            : !desktopConfigAvailable
                ? 'Host desktop config is unavailable'
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
    const permissionMode = permissionModeSupported
        ? effectiveSavedSettings?.permissionMode ?? action.permissionMode ?? configuredPermissionMode
        : ''

    return {
        agent,
        agentAvailability: capabilities.availability.values,
        agentProfiles,
        availabilityLoading: capabilities.availability.loading,
        backendAvailable,
        desktopConfigAvailable,
        model,
        permissionMode,
        permissionModeSupported,
        runDisabledMessage,
        selectedAgentAvailable,
        selectedAgentModels,
        settingsChangedWhileWaiting: snapshot.settingsChangedWhileWaiting,
        settingsLoading: snapshot.loading,
        thinkingLevel,
    }
}
