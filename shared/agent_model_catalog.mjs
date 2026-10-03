import { CODEX_MAX_THINKING_LEVEL, THINKING_LEVELS, validateSpeedMode } from './agent_profiles.mjs';

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
    requiredText(value.provider, 'provider', source);
    requiredText(value.source, 'source', source);
    if (!['runtime', 'configured'].includes(value.source)) throw new Error(`Invalid catalog source in ${source}`);
    if (!Number.isFinite(value.fetchedAt)) throw new Error(`Invalid catalog timestamp in ${source}`);
    if (!Array.isArray(value.models) || value.models.length === 0) throw new Error(`Model catalog is empty in ${source}`);
    const identifiers = new Set();
    for (const model of value.models) {
        if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error(`Invalid model in ${source}`);
        const identifier = requiredText(model.id, 'model ID', source);
        requiredText(model.displayName, 'model display name', source);
        if (identifiers.has(identifier)) throw new Error(`Duplicate model ID ${identifier} in ${source}`);
        identifiers.add(identifier);
        if (typeof model.hidden !== 'boolean') throw new Error(`Invalid model visibility in ${source}`);
        if (model.resolvedModel !== undefined) requiredText(model.resolvedModel, 'resolved model', source);
        if (model.reasoningEfforts !== null && (!Array.isArray(model.reasoningEfforts)
            || model.reasoningEfforts.some((effort) => typeof effort !== 'string' || effort.length === 0))) {
            throw new Error(`Invalid model reasoning efforts in ${source}`);
        }
        if (!Array.isArray(model.serviceTiers)) throw new Error(`Invalid model service tiers in ${source}`);
        const tiers = new Set();
        for (const tier of model.serviceTiers) {
            requiredText(tier.id, 'service tier ID', source);
            requiredText(tier.name, 'service tier name', source);
            if (tiers.has(tier.id)) throw new Error(`Duplicate service tier ${tier.id} in ${source}`);
            tiers.add(tier.id);
        }
    }

    return value;
}

/** Resolve a wire ID or an advertised Claude alias without modifying the stored selection. */
export function findCatalogModel(catalog, model) {
    return catalog.models.find(({ id }) => id === model)
        ?? catalog.models.find(({ resolvedModel }) => resolvedModel === model)
        ?? null;
}

export function modelThinkingLevels(agent, model) {
    if (!model) return ['none'];
    if (model.reasoningEfforts === null) return [...THINKING_LEVELS];

    return THINKING_LEVELS.filter((level) => level === 'none'
        || model.reasoningEfforts.includes(agent === 'codex' && level === 'max' ? CODEX_MAX_THINKING_LEVEL : level));
}

/** OpenAI advertises the Fast transport tier as priority; never infer support from a model name. */
export function modelFastTier(catalog, model) {
    if (catalog.agent !== 'codex' || catalog.provider !== 'openai' || !model) return null;

    return model.serviceTiers.find(({ id }) => id === 'priority' || id === 'fast') ?? null;
}

/** Validate requested settings before launching a provider or starting another inference turn. */
export function validateCatalogSelection(catalog, selection, source = 'agent execution') {
    const model = findCatalogModel(catalog, selection.model);
    if (!model) {
        throw new Error(`Model ${selection.model} is not advertised by ${catalog.agent} in ${source}. Refresh models or check the configured client.`);
    }
    if (selection.thinkingLevel !== undefined && !modelThinkingLevels(catalog.agent, model).includes(selection.thinkingLevel)) {
        throw new Error(`Model ${selection.model} does not support reasoning level ${selection.thinkingLevel}`);
    }
    const speedMode = selection.speedMode === undefined ? 'default' : validateSpeedMode(selection.speedMode, source);
    if (speedMode !== 'default' && (catalog.agent !== 'codex' || catalog.provider !== 'openai')) {
        throw new Error('Explicit speed settings are supported only by the OpenAI Codex provider');
    }
    const fastTier = modelFastTier(catalog, model);
    if (speedMode === 'fast' && !fastTier) throw new Error(`Fast mode is not advertised for ${selection.model}`);

    return { model, serviceTier: speedMode === 'fast' ? fastTier.id : speedMode === 'standard' ? 'default' : undefined };
}
