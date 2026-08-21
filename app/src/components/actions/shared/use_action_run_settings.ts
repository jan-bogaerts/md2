import { useSyncExternalStore } from 'react'
import type { ActionDefinition } from '../../../data/action_types'
import {
    findAgentProfile,
    mergeAgentProfiles,
    supportsPermissionMode,
    validateThinkingLevel,
} from '../../../data/agent_profiles'
import {
    projectAgentSelection,
    resolveAgentSelectionState,
    type AgentSelectionState,
} from '../../../data/agent_selection'
import { hasActionRunBackend } from '../../../data/electron_action_bridge'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { useAgentCapabilities } from '../../hooks/use_agent_capabilities'
import { useConfigValueOrFallback, useHasDesktopConfig } from '../../hooks/use_config_value'
import { useProjectReadOnly } from '../../hooks/use_project_read_only'

/** Resolve agent input and backend state only for controls that consume it. */
export function useActionRunSettings(action: ActionDefinition, store: ActionRunSettingsStore) {
    const desktopSelection = useConfigValueOrFallback('desktop.agentSelection', {
        activeAgent: 'codex',
        permissionMode: 'ask-for-approval',
        settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'none' } },
    })
    const configuredAgentProfiles = useConfigValueOrFallback('desktop.agentProfiles', [])
    const desktopConfigAvailable = useHasDesktopConfig()
    const readOnly = useProjectReadOnly()
    const capabilities = useAgentCapabilities()
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const agentProfiles = mergeAgentProfiles(configuredAgentProfiles)
    const savedSettings = snapshot.settings
    const baseSelection = desktopSelection as AgentSelectionState
    const defaultAgent = action.agent ?? baseSelection.activeAgent
    const definitionSource: AgentSelectionState | null = action.agent && action.model
        ? {
            activeAgent: action.agent,
            permissionMode: action.permissionMode ?? baseSelection.permissionMode,
            settingsByAgent: {
                [action.agent]: {
                    model: action.model,
                    thinkingLevel: validateThinkingLevel(action.thinkingLevel ?? 'none', `action "${action.label}"`),
                },
            },
        }
        : null
    const unresolvedSelection: AgentSelectionState = savedSettings ?? {
        activeAgent: defaultAgent,
        permissionMode: action.permissionMode ?? baseSelection.permissionMode,
        settingsByAgent: {},
    }
    const resolutionSources = [definitionSource, baseSelection].filter((source): source is AgentSelectionState => !!source)
    const selection = resolveAgentSelectionState(unresolvedSelection, agentProfiles, resolutionSources)
    const projectedSelection = projectAgentSelection(selection)
    const { agent, model, permissionMode, thinkingLevel } = projectedSelection
    const selectedAgentProfile = findAgentProfile(agentProfiles, agent)
    const selectedAgentModels = selectedAgentProfile?.models ?? []
    const permissionModeSupported = !!selectedAgentProfile && supportsPermissionMode(selectedAgentProfile)
    const selectedAvailability = capabilities.availability.values[agent]
    const selectedAgentAvailable = action.type !== 'agent'
        || (!!selectedAvailability?.available && !capabilities.availability.error)
    const backendAvailable = hasActionRunBackend()
    const runDisabledMessage = readOnly
        ? 'Public GitHub repository is read-only'
        : snapshot.loading
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
        selectionSources: resolutionSources,
        settingsChangedWhileWaiting: snapshot.settingsChangedWhileWaiting,
        settingsLoading: snapshot.loading,
        selection,
        thinkingLevel,
    }
}
