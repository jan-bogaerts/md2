import * as agentProfiles from '../../../shared/agent_profiles.mjs';

export const {
    BUILTIN_AGENT_PROFILES,
    DEFAULT_AGENT_PROFILE_NAME,
    MODEL_PLACEHOLDER,
    SESSION_ID_PLACEHOLDER,
    THINKING_LEVELS,
    buildAgentCommand,
    buildAgentExecutionCommand,
    buildAgentStreamingCommand,
    buildResumeAgentCommand,
    defaultModelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    normalizeAgentProfiles,
    supportsAgentStreaming,
    validateAgentProfiles,
    validateAgentSelection,
    validateThinkingLevel,
} = agentProfiles;

export function resolveAgentCommand(config, selection = {}, streaming = false) {
    const profiles = config.agentProfiles ?? [];
    const configuredProfile = findAgentProfile(profiles, config.agent);
    const defaultAgent = configuredProfile ? config.agent : DEFAULT_AGENT_PROFILE_NAME;
    const defaultModel = configuredProfile ? config.model : '';
    const agent = selection.agent ?? defaultAgent;
    const profile = findAgentProfile(profiles, agent);
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`);
    const model = (selection.model ?? defaultModel) || defaultModelForProfile(profile);
    const thinkingLevel = selection.thinkingLevel ?? config.thinkingLevel ?? 'none';
    validateAgentSelection(profiles, { agent, model }, 'desktop config');

    const searchEnabled = config.codexSearchEnabled ?? true;

    const command = streaming
        ? buildAgentStreamingCommand(profile, model, thinkingLevel)
        : buildAgentExecutionCommand(profile, model, thinkingLevel, searchEnabled);

    return { agent, command, model, profile, thinkingLevel };
}
