const { ACCOUNT_DIRECTORY_VARIABLES, createAgentEnvironment } = require('./agent_environment');

/**
 * Creates the process environment for one agent account. A directory account overrides only its own
 * provider's configuration-directory variable; the initial account keeps the inherited environment.
 */
function createAgentAccountEnvironment(environment, account) {
    return createAgentEnvironment(environment, account.agent, false, account);
}

module.exports = { ACCOUNT_DIRECTORY_VARIABLES, createAgentAccountEnvironment };
