import { useSyncExternalStore } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import {
    defaultModelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    validateThinkingLevel,
} from '../../data/agent_profiles'
import { hasActionRunBackend } from '../../data/electron_action_bridge'
import { useAgentCapabilities } from '../hooks/use_agent_capabilities'
import { useConfigValueOrFallback } from '../hooks/use_config_value'
import type { ActionRunInputStore } from './action_run_input_store'

/** Resolve agent input and backend state only for controls that consume it. */
export function useActionRunSettings(action: ActionDefinition, store: ActionRunInputStore) {
    const configuredAgent = useConfigValueOrFallback('desktop.agent', '')
    const configuredAgentProfiles = useConfigValueOrFallback('desktop.agentProfiles', [])
    const configuredModel = useConfigValueOrFallback('desktop.model', '')
    const configuredThinkingLevel = useConfigValueOrFallback('desktop.thinkingLevel', 'none')
    const capabilities = useAgentCapabilities()
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const agentProfiles = mergeAgentProfiles(configuredAgentProfiles)
    const defaultAgent = action.agent ?? configuredAgent
    const agent = snapshot.agentOverride ?? defaultAgent
    const defaultAgentProfile = findAgentProfile(agentProfiles, defaultAgent)
    const defaultModel = (action.model ?? configuredModel)
        || (defaultAgentProfile ? defaultModelForProfile(defaultAgentProfile) : '')
    const model = snapshot.modelOverride ?? defaultModel
    const selectedAgentProfile = findAgentProfile(agentProfiles, agent)
    const selectedAgentModels = selectedAgentProfile?.models ?? []
    const selectedAvailability = capabilities.availability.values[agent]
    const selectedAgentAvailable = action.type !== 'agent'
        || (!!selectedAvailability?.available && !capabilities.availability.error)
    const backendAvailable = hasActionRunBackend()
    const runDisabledMessage = !backendAvailable
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
    const thinkingLevel = snapshot.thinkingLevelOverride ?? definitionThinkingLevel

    return {
        ...snapshot,
        agent,
        agentAvailability: capabilities.availability.values,
        agentProfiles,
        backendAvailable,
        model,
        runDisabledMessage,
        selectedAgentAvailable,
        selectedAgentModels,
        thinkingLevel,
    }
}
