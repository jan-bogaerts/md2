import * as agentProfiles from '../../../shared/agent_profiles.mjs'

export const {
    BUILTIN_AGENT_PROFILES,
    DEFAULT_AGENT_PROFILE_NAME,
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
    const profiles = config.agentProfiles ?? []
    const configuredProfile = findAgentProfile(profiles, config.agent)
    const defaultAgent = configuredProfile ? config.agent : DEFAULT_AGENT_PROFILE_NAME
    const defaultModel = configuredProfile ? config.model : ''
    const agent = selection.agent ?? defaultAgent
    const profile = findAgentProfile(profiles, agent)
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`)
    const model = (selection.model ?? defaultModel) || defaultModelForProfile(profile)
    const thinkingLevel = selection.thinkingLevel ?? config.thinkingLevel ?? 'none'
    validateAgentSelection(profiles, { agent, model }, 'desktop config')

    return { agent, command: buildAgentExecutionCommand(profile, model, thinkingLevel), model, profile, thinkingLevel }
}
