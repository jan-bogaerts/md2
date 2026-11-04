const path = require('node:path');

const BLOCKED_AGENT_ENVIRONMENT_VARIABLES = new Set([
    'node_options',
    'vscode_inspector_options',
]);
const CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE = 'CLAUDE_CODE_FORWARD_SUBAGENT_TEXT';
const CLAUDE_TODO_TOOLS_VARIABLE = 'CLAUDE_CODE_ENABLE_TODO_TOOLS';
const DIRECTORY_ACCOUNT_KIND = 'directory';
const ACCOUNT_DIRECTORY_VARIABLES = { claude: 'CLAUDE_CONFIG_DIR', codex: 'CODEX_HOME' };

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
function createAgentEnvironment(environment, agent, agentTaskTrackingEnabled = false, account = null) {
    const copied = Object.fromEntries(
        Object.entries(environment).filter(([name]) => !BLOCKED_AGENT_ENVIRONMENT_VARIABLES.has(name.toLowerCase())),
    );
    const providerEnvironment = agent === 'claude' ? {
        ...copied,
        ...(!hasEnvironmentVariable(copied, CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE)
            ? { [CLAUDE_FORWARD_SUBAGENT_TEXT_VARIABLE]: '1' } : {}),
        ...(agentTaskTrackingEnabled && !hasEnvironmentVariable(copied, CLAUDE_TODO_TOOLS_VARIABLE)
            ? { [CLAUDE_TODO_TOOLS_VARIABLE]: '1' } : {}),
    } : copied;
    if (!account || account.kind !== DIRECTORY_ACCOUNT_KIND) return providerEnvironment;
    if (account.agent !== agent) throw new Error(`Agent account ${account.id} belongs to ${account.agent}, not ${agent}`);
    const variable = ACCOUNT_DIRECTORY_VARIABLES[agent];
    if (!variable) throw new Error(`Agent does not support account directories: ${agent}`);
    const withoutVariable = Object.fromEntries(
        Object.entries(providerEnvironment).filter(([name]) => name.toLowerCase() !== variable.toLowerCase()),
    );

    return { ...withoutVariable, [variable]: path.resolve(account.configDirectory) };
}

module.exports = { ACCOUNT_DIRECTORY_VARIABLES, createAgentEnvironment };
