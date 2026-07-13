import * as agentProfiles from '../../../shared/agent_profiles.mjs'

export const {
    BUILTIN_AGENT_PROFILES,
    MODEL_PLACEHOLDER,
    SESSION_ID_PLACEHOLDER,
    THINKING_LEVELS,
    buildAgentCommand,
    buildAgentExecutionCommand,
    buildResumeAgentCommand,
    defaultModelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    validateAgentProfiles,
    validateAgentSelection,
    validateThinkingLevel,
} = agentProfiles

export function resolveAgentCommand(config, selection = {}) {
    const agent = selection.agent ?? config.agent
    const profiles = config.agentProfiles ?? []
    const profile = findAgentProfile(profiles, agent)
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`)
    const model = (selection.model ?? config.model) || defaultModelForProfile(profile)
    const thinkingLevel = selection.thinkingLevel ?? config.thinkingLevel ?? 'none'
    validateAgentSelection(profiles, { agent, model }, 'desktop config')

    return { agent, command: buildAgentExecutionCommand(profile, model, thinkingLevel), model, profile, thinkingLevel }
}
