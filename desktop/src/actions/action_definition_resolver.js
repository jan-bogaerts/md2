/** Resolve one action definition without exposing cache or file-read details to callers. */
async function resolveActionDefinition(actionDefinitionCache, profiles, actionId, states) {
    return actionDefinitionCache.resolve(actionId, profiles, states);
}

module.exports = { resolveActionDefinition };
