import * as agentProfiles from '../../../../shared/agent_profiles.mjs';
import {
    resolveAgentSelectionState,
    resolveAgentSettings,
} from '../../../../shared/agent_selection.mjs';

export const {
    BUILTIN_AGENT_PROFILES,
    DEFAULT_AGENT_PROFILE_NAME,
    DEFAULT_PERMISSION_MODE,
    MODEL_PLACEHOLDER,
    SESSION_ID_PLACEHOLDER,
    THINKING_LEVELS,
    PERMISSION_MODES,
    PERMISSION_MODE_OPTIONS,
    buildAgentCommand,
    buildAgentExecutionCommand,
    buildAgentStreamingCommand,
    buildResumeAgentCommand,
    defaultModelForProfile,
    defaultThinkingLevelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    migrateAgentProfiles,
    normalizeAgentProfiles,
    supportsPermissionMode,
    supportsThinkingLevel,
    supportsAgentStreaming,
    validateAgentProfiles,
    validateAgentSelection,
    validatePermissionMode,
    validateThinkingLevel,
} = agentProfiles;

export function resolveAgentCommand(config, selection = {}, streaming = false) {
    const profiles = config.agentProfiles ?? [];
    if (!config.agentSelection) throw new Error('Missing desktop agent selection');
    const configuredSelection = resolveAgentSelectionState(config.agentSelection, profiles);
    const agent = selection.agent ?? configuredSelection.activeAgent;
    const profile = findAgentProfile(profiles, agent);
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`);
    const remembered = resolveAgentSettings(agent, profiles, [configuredSelection]);
    const model = (selection.model ?? remembered.model) || defaultModelForProfile(profile);
    const thinkingLevel = selection.thinkingLevel ?? remembered.thinkingLevel;
    const permissionMode = selection.permissionMode !== undefined
        ? selection.permissionMode
        : supportsPermissionMode(profile)
            ? configuredSelection.permissionMode
            : undefined;
    validateAgentSelection(profiles, {
        agent,
        model,
        ...(permissionMode !== undefined ? { permissionMode } : {}),
        thinkingLevel,
    }, 'desktop config');

    const searchEnabled = config.codexSearchEnabled ?? true;

    const command = streaming
        ? buildAgentStreamingCommand(profile, model, thinkingLevel, permissionMode)
        : buildAgentExecutionCommand(profile, model, thinkingLevel, searchEnabled, permissionMode);

    return { agent, command, model, ...(permissionMode !== undefined ? { permissionMode } : {}), profile, thinkingLevel };
}
