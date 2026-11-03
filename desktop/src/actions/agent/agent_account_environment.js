const path = require('node:path');
const { createAgentEnvironment } = require('./agent_environment');
const { DIRECTORY_ACCOUNT_KIND } = require('./agent_accounts.mjs');

const ACCOUNT_DIRECTORY_VARIABLES = { claude: 'CLAUDE_CONFIG_DIR', codex: 'CODEX_HOME' };

/**
 * Creates the process environment for one agent account. A directory account overrides only its own
 * provider's configuration-directory variable; the initial account keeps the inherited environment.
 */
function createAgentAccountEnvironment(environment, account) {
    const agentEnvironment = createAgentEnvironment(environment, account.agent);
    if (account.kind !== DIRECTORY_ACCOUNT_KIND) return agentEnvironment;
    const variable = ACCOUNT_DIRECTORY_VARIABLES[account.agent];
    if (!variable) throw new Error(`Agent does not support account directories: ${account.agent}`);
    // Windows environment names are case-insensitive, so an inherited spelling must not survive next to the override.
    const withoutVariable = Object.fromEntries(
        Object.entries(agentEnvironment).filter(([name]) => name.toLowerCase() !== variable.toLowerCase()),
    );

    return { ...withoutVariable, [variable]: path.resolve(account.configDirectory) };
}

module.exports = { ACCOUNT_DIRECTORY_VARIABLES, createAgentAccountEnvironment };
