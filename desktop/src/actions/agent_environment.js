const BLOCKED_AGENT_ENVIRONMENT_VARIABLES = new Set([
    'node_options',
    'vscode_inspector_options',
]);

/** Copy parent environment without editor debugger auto-attach settings. */
function createAgentEnvironment(environment) {
    return Object.fromEntries(
        Object.entries(environment).filter(([name]) => !BLOCKED_AGENT_ENVIRONMENT_VARIABLES.has(name.toLowerCase())),
    );
}

module.exports = { createAgentEnvironment };
