const BLOCKED_AGENT_ENVIRONMENT_VARIABLES = new Set([
    'node_options',
    'vscode_inspector_options',
]);
const CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE = 'CLAUDE_CODE_FORWARD_SUBAGENT_TEXT';
const CLAUDE_TODO_TOOLS_VARIABLE = 'CLAUDE_CODE_ENABLE_TODO_TOOLS';

function hasEnvironmentVariable(environment, name) {
    const wanted = name.toLowerCase();

    return Object.keys(environment).some((key) => key.toLowerCase() === wanted);
}

/**
 * Copy parent environment without editor debugger auto-attach settings.
 *
 * Claude only forwards sub-agent text and exposes task tools when asked to. These requests travel
 * as environment variables rather than command-line flags because an older CLI exits on an unknown
 * flag but silently ignores an unknown variable.
 */
function createAgentEnvironment(environment, agent, agentTaskTrackingEnabled = false) {
    const copied = Object.fromEntries(
        Object.entries(environment).filter(([name]) => !BLOCKED_AGENT_ENVIRONMENT_VARIABLES.has(name.toLowerCase())),
    );
    if (agent !== 'claude') return copied;

    return {
        ...copied,
        ...(!hasEnvironmentVariable(copied, CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE)
            ? { [CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE]: '1' } : {}),
        ...(agentTaskTrackingEnabled && !hasEnvironmentVariable(copied, CLAUDE_TODO_TOOLS_VARIABLE)
            ? { [CLAUDE_TODO_TOOLS_VARIABLE]: '1' } : {}),
    };
}

module.exports = { createAgentEnvironment };
