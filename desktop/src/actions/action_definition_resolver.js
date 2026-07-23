/** Resolve one action definition without exposing cache or file-read details to callers. */
async function resolveActionDefinition(actionDefinitionCache, profiles, actionId) {
    return actionDefinitionCache.resolve(actionId, profiles);
}

module.exports = { resolveActionDefinition };
