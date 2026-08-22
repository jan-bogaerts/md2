const BLOCKED_AGENT_ENVIRONMENT_VARIABLES = new Set([
    'node_options',
    'vscode_inspector_options',
]);
const CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE = 'CLAUDE_CODE_FORWARD_SUBAGENT_TEXT';

function hasEnvironmentVariable(environment, name) {
    const wanted = name.toLowerCase();

    return Object.keys(environment).some((key) => key.toLowerCase() === wanted);
}

/**
 * Copy parent environment without editor debugger auto-attach settings.
 *
 * Claude only forwards sub-agent text and thinking when asked to. The request travels as an
 * environment variable rather than a command-line flag because an older CLI exits on an unknown
 * flag but silently ignores an unknown variable.
 */
function createAgentEnvironment(environment, agent) {
    const copied = Object.fromEntries(
        Object.entries(environment).filter(([name]) => !BLOCKED_AGENT_ENVIRONMENT_VARIABLES.has(name.toLowerCase())),
    );
    if (agent !== 'claude' || hasEnvironmentVariable(copied, CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE)) return copied;

    return { ...copied, [CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE]: '1' };
}

module.exports = { createAgentEnvironment };
