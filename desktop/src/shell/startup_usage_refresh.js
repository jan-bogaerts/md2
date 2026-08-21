/** Starts account usage refresh before creating renderer, without waiting for provider work. */
function createWindowWithStartupUsageRefresh({ agentProfiles, agentRunnerService, createWindow }) {
    agentRunnerService.requestStartupUsageRefresh(agentProfiles);

    return createWindow();
}

module.exports = { createWindowWithStartupUsageRefresh };
