const { loadTolerantActionDefinitionGraph } = require('../../../shared/tolerant_action_definitions.mjs');

/** Load, validate, and resolve one action definition by stable id. */
async function resolveActionDefinition(localGitService, project, actionsFolder, profiles, actionId) {
    const files = await localGitService.loadActionFiles(project, actionsFolder);
    const { actions, issues } = loadTolerantActionDefinitionGraph(files, { profiles });
    const action = actions.find((candidate) => candidate.id === actionId);
    if (!action) {
        const issueDetails = issues.length > 0 ? `. ${issues.map(({ message }) => message).join(' ')}` : '';
        throw new Error(`Unknown action: ${actionId}${issueDetails}`);
    }

    return action;
}

module.exports = { resolveActionDefinition };
