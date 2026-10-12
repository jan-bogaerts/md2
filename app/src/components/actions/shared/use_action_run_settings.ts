import { useSyncExternalStore } from 'react'
import type { ActionDefinition } from '../../../data/action_types'
import {
    findAgentProfile,
    defaultModelForProfile,
    mergeAgentProfiles,
    supportsPermissionMode,
    validateAgentSelection,
    validateThinkingLevel,
    supportsThinkingLevel,
    THINKING_LEVELS,
} from '../../../data/agent_profiles'
import { agentModelOptions } from '../../../data/agent_model_options';
import {
    DEFAULT_AGENT_SELECTION,
    projectAgentSelection,
    resolveAgentSelectionState,
    resolveAgentSettings,
    type AgentSelectionState,
} from '../../../data/agent_selection'
import { hasActionRunBackend } from '../../../data/electron_action_bridge'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { useAgentCapabilities } from '../../hooks/use_agent_capabilities'
import { useConfigValueOrFallback, useHasDesktopConfig } from '../../hooks/use_config_value'
import { useProjectReadOnly } from '../../hooks/use_project_read_only'
import { useAgentModelCatalog } from '../../hooks/use_agent_model_catalog';

function agentSelectionError(agentProfiles: ReturnType<typeof mergeAgentProfiles>, selection: ReturnType<typeof projectAgentSelection>) {
    try {
        validateAgentSelection(agentProfiles, selection, 'action run settings')

        return null
    } catch (error) {
        return error instanceof Error ? error.message : 'Invalid action run settings'
    }
}

/** Resolve agent input and backend state only for controls that consume it. */
export function useActionRunSettings(action: ActionDefinition, store: ActionRunSettingsStore) {
    const desktopSelection = useConfigValueOrFallback('desktop.agentSelection', DEFAULT_AGENT_SELECTION)
    const configuredAgentProfiles = useConfigValueOrFallback('desktop.agentProfiles', [])
    const desktopConfigAvailable = useHasDesktopConfig()
    const readOnly = useProjectReadOnly()
    const capabilities = useAgentCapabilities()
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const agentProfiles = mergeAgentProfiles(configuredAgentProfiles)
    const savedSettings = snapshot.settings
    const baseSelection = desktopSelection as AgentSelectionState
    const defaultAgent = action.agent ?? baseSelection.activeAgent
    const rememberedDefinitionSettings = resolveAgentSettings(defaultAgent, agentProfiles, [baseSelection]);
    const definitionSource: AgentSelectionState | null = action.agent || action.speedMode !== undefined
        ? {
            activeAgent: defaultAgent,
            permissionMode: action.permissionMode ?? baseSelection.permissionMode,
            settingsByAgent: {
                [defaultAgent]: {
                    ...rememberedDefinitionSettings,
                    model: action.model ?? rememberedDefinitionSettings.model,
                    thinkingLevel: validateThinkingLevel(action.thinkingLevel ?? rememberedDefinitionSettings.thinkingLevel, `action "${action.label}"`),
                    ...(action.speedMode !== undefined ? { speedMode: action.speedMode } : {}),
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
    const projectedSelection = projectAgentSelection(selection, agentProfiles)
    const { agent, permissionMode, thinkingLevel, speedMode } = projectedSelection
    const selectedAgentProfile = findAgentProfile(agentProfiles, agent)
    const model = projectedSelection.model || (selectedAgentProfile ? defaultModelForProfile(selectedAgentProfile) : '');
    const modelCatalog = useAgentModelCatalog(action.type === 'agent' ? selectedAgentProfile : null);
    const modelOptions = agentModelOptions(modelCatalog.catalog, model);
    const thinkingLevelOptions = THINKING_LEVELS
        .filter((level) => !!selectedAgentProfile && supportsThinkingLevel(selectedAgentProfile, level));
    const selectionValidationError = action.type === 'agent' ? agentSelectionError(agentProfiles, projectedSelection) : null;
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
                        : selectionValidationError
                            ? selectionValidationError
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
        modelOptions,
        modelCatalog,
        thinkingLevelOptions,
        speedMode,
        selectionSources: resolutionSources,
        selectionValidationError,
        settingsChangedWhileWaiting: snapshot.settingsChangedWhileWaiting,
        settingsLoading: snapshot.loading,
        selection,
        thinkingLevel,
    }
}
