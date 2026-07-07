import type { ActionDefinition } from '../data/action_types'
import {
    buildAgentCommand,
    defaultModelForProfile,
    findAgentProfile,
    validateAgentSelection,
} from '../data/agent_profiles'
import type { DesktopConfigValues } from './config_service'

interface AgentRunSelectionInput {
    agent?: string
    model?: string
}

export interface ResolvedAgentRun {
    agent: string
    command: string
    model: string
    sessionIdPattern?: string
}

export function resolveAgentRun(config: DesktopConfigValues, action: ActionDefinition, input: AgentRunSelectionInput): ResolvedAgentRun {
    const agent = input.agent ?? action.agent ?? config.agent
    const profile = findAgentProfile(config.agentProfiles, agent)
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`)

    const model = (input.model ?? action.model ?? config.model) || defaultModelForProfile(profile)
    validateAgentSelection(config.agentProfiles, { agent, model }, `action "${action.name}"`)

    return {
        agent,
        command: buildAgentCommand(profile, model),
        model,
        ...(profile.sessionIdPattern ? { sessionIdPattern: profile.sessionIdPattern } : {}),
    }
}
