/** Resolve one action definition without exposing cache or file-read details to callers. */
async function resolveActionDefinition(actionDefinitionCache, accounts, profiles, actionId, states) {
    return actionDefinitionCache.resolve(actionId, accounts, profiles, states);
}

module.exports = { resolveActionDefinition };
