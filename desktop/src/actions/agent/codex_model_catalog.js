const MAX_CATALOG_PAGES = 20;

function codexModel(model) {

    return {
        id: model.model,
        displayName: model.displayName,
        ...(typeof model.description === 'string' ? { description: model.description } : {}),
        hidden: model.hidden,
    };
}

/** Read every model-list page without consulting provider configuration or policy. */
async function readCodexModelCatalog(probe) {
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
    return { models };
}

module.exports = { readCodexModelCatalog };
