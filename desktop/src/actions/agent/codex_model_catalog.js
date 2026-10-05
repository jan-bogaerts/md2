const MAX_CATALOG_PAGES = 20;

function codexModel(model) {
    if (!model || !Array.isArray(model.supportedReasoningEfforts)) throw new Error('Codex returned malformed model capabilities');

    return {
        id: model.model,
        displayName: model.displayName,
        ...(typeof model.description === 'string' ? { description: model.description } : {}),
        hidden: model.hidden,
        reasoningEfforts: model.supportedReasoningEfforts.map(({ reasoningEffort }) => reasoningEffort),
        serviceTiers: model.serviceTiers === undefined ? [] : model.serviceTiers.map(({ id, name, description }) => ({id, name, ...(typeof description === 'string' ? { description } : {})})),
    };
}

/** Read every catalog page and the effective provider using the same process configuration. */
async function readCodexModelCatalog(probe, cwd) {
    await probe.request('initialize', { clientInfo: { name: 'md2', version: '1' }, capabilities: { experimentalApi: true } });
    probe.write({ method: 'initialized', params: {} });
    const models = [];
    const cursors = new Set();
    let cursor;
    let complete = false;
    for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
        const response = await probe.request('model/list', { includeHidden: true, limit: 100, ...(cursor ? { cursor } : {}) });
        if (!response || !Array.isArray(response.data)) throw new Error('Codex returned a malformed model catalog');
        models.push(...response.data.map(codexModel));
        if (response.nextCursor === null) {
            complete = true;
            break;
        }
        if (typeof response.nextCursor !== 'string' || response.nextCursor.length === 0 || cursors.has(response.nextCursor)) {
            throw new Error('Codex returned an invalid or repeated catalog cursor');
        }
        cursor = response.nextCursor;
        cursors.add(cursor);
    }
    if (!complete) throw new Error('Codex model catalog exceeded its page limit');
    const configuration = await probe.request('config/read', { cwd, includeLayers: false });
    if (!configuration?.config || typeof configuration.config !== 'object') throw new Error('Codex provider configuration is missing');
    // Codex's unset model_provider explicitly selects its built-in OpenAI provider.
    const provider = configuration.config.model_provider ?? 'openai';
    const policy = await probe.request('configRequirements/read', {});
    if (!policy || !Object.hasOwn(policy, 'requirements')) throw new Error('Codex capability requirements are missing');
    const fastModeAllowed = policy.requirements?.featureRequirements?.fast_mode !== false;

    return {
        models: fastModeAllowed ? models : models.map((model) => ({...model, serviceTiers: model.serviceTiers.filter(({ id }) => id !== 'priority' && id !== 'fast')})),
        provider,
    };
}

module.exports = { readCodexModelCatalog };
