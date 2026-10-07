function requiredText(value, field, source) {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
        throw new Error(`Invalid ${field} in ${source}`);
    }

    return value;
}

/** Validate the host catalog at the bridge boundary without inferring provider capabilities. */
export function validateAgentModelCatalog(value, source = 'agent model catalog') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid catalog in ${source}`);
    requiredText(value.agent, 'agent', source);
    if (!Array.isArray(value.models)) throw new Error(`Invalid model list in ${source}`);
    for (const model of value.models) {
        if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error(`Invalid model in ${source}`);
        requiredText(model.id, 'model ID', source);
        requiredText(model.displayName, 'model display name', source);
        if (typeof model.hidden !== 'boolean') throw new Error(`Invalid model visibility in ${source}`);
        if (model.resolvedModel !== undefined) requiredText(model.resolvedModel, 'resolved model', source);
    }

    return value;
}

/** Resolve a wire ID or an advertised Claude alias without modifying the stored selection. */
export function findCatalogModel(catalog, model) {
    return catalog.models.find(({ id }) => id === model)
        ?? catalog.models.find(({ resolvedModel }) => resolvedModel === model)
        ?? null;
}
