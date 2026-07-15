const { loadActionDefinitions, sanitizeActionValidationError } = require('../../../shared/action_definitions.mjs')

/** Load, validate, and resolve one action definition by stable id. */
async function resolveActionDefinition(localGitService, project, actionsFolder, profiles, actionId) {
    const files = await localGitService.loadActionFiles(project, actionsFolder)
    let actions
    try {
        actions = loadActionDefinitions(files, { profiles })
    } catch (error) {
        throw sanitizeActionValidationError(error)
    }
    const action = actions.find((candidate) => candidate.id === actionId)
    if (!action) throw new Error(`Unknown action: ${actionId}`)

    return action
}

module.exports = { resolveActionDefinition }
