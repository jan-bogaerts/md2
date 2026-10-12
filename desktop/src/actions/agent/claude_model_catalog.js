function claudeModel(model) {
    if (!model || typeof model !== 'object') throw new Error('Claude returned a malformed model catalog');

    return {
        id: model.value,
        displayName: model.displayName,
        ...(typeof model.description === 'string' ? { description: model.description } : {}),
        ...(model.resolvedModel !== undefined ? { resolvedModel: model.resolvedModel } : {}),
        hidden: false,
    };
}

/** Initialize Claude without a prompt; the response carries its configured model picker. */
async function readClaudeModelCatalog(probe) {
    const response = await probe.request('initialize', { hooks: null });
    if (!Array.isArray(response.models)) throw new Error('Claude does not expose a model catalog; check its installed version');

    return { models: response.models.map(claudeModel) };
}

const CLAUDE_CATALOG_ARGUMENTS = [
    '--print', '--verbose', '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', '', '--settings', '{"disableAllHooks":true}',
];

module.exports = { CLAUDE_CATALOG_ARGUMENTS, readClaudeModelCatalog };
