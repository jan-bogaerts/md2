import * as agentProfiles from '../../../../shared/agent_profiles.mjs';

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
    defaultAccessLevelForProfile,
    defaultApprovalPolicyForProfile,
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
    const accessLevel = selection.accessLevel !== undefined
        ? selection.accessLevel
        : profile.accessLevels
            ? (config.accessLevel || profile.defaultAccessLevel)
            : undefined;
    const approvalPolicy = selection.approvalPolicy !== undefined
        ? selection.approvalPolicy
        : profile.approvalPolicies
            ? (config.approvalPolicy || profile.defaultApprovalPolicy)
            : undefined;
    const capabilities = {
        ...(accessLevel !== undefined && accessLevel !== '' ? { accessLevel } : {}),
        ...(approvalPolicy !== undefined && approvalPolicy !== '' ? { approvalPolicy } : {}),
    };
    validateAgentSelection(profiles, { agent, model, ...capabilities }, 'desktop config');

    const searchEnabled = config.codexSearchEnabled ?? true;

    const command = streaming
        ? buildAgentStreamingCommand(profile, model, thinkingLevel, capabilities)
        : buildAgentExecutionCommand(profile, model, thinkingLevel, searchEnabled, capabilities);

    return { agent, command, model, profile, thinkingLevel, ...capabilities };
}
