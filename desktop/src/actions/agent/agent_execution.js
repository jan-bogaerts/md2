const { buildAgentExecutionCommand, buildAgentStreamingCommand, CODEX_MAX_THINKING_LEVEL } = require('../../../../shared/agent_profiles.mjs');
const { resolveAgentConfiguration } = require('./agent_profiles.mjs');

/** Prepare launch settings without reading or refreshing the model catalog. */
function resolveAgentExecution(config, selection, streaming) {
    const resolved = resolveAgentConfiguration(config, selection);
    const serviceTier = resolved.speedMode === 'fast' ? 'priority' : resolved.speedMode === 'standard' ? 'default' : undefined;
    const speedSettings = { speedMode: resolved.speedMode, serviceTier };
    const command = streaming
        ? buildAgentStreamingCommand(
            resolved.profile, resolved.model, resolved.thinkingLevel, resolved.permissionMode, speedSettings,
        )
        : buildAgentExecutionCommand(
            resolved.profile, resolved.model, resolved.thinkingLevel,
            config.codexSearchEnabled ?? true, resolved.permissionMode, speedSettings,
        );
    const reasoningEffort = resolved.agent === 'codex' && resolved.thinkingLevel === 'max'
        ? CODEX_MAX_THINKING_LEVEL : resolved.thinkingLevel;
    const executionSettings = {
        model: resolved.model,
        ...(resolved.thinkingLevel !== 'none' ? { effort: reasoningEffort } : {}),
        ...(serviceTier !== undefined ? { serviceTier } : {}),
    };

    return { ...resolved, command, executionSettings };
}

module.exports = { resolveAgentExecution };
