const { normalizeChangedPaths, normalizedContent } = require('./agent_event_utils');

const CODEX_FILE_ITEM_KEYS = new Set(['file', 'filechange', 'patch']);
const CODEX_SILENT_ITEM_KEYS = new Set(['agentmessage', 'usermessage', 'reasoning', 'error', 'file', 'filechange', 'patch']);

/**
 * `codex exec` and the codex app-server are different wire protocols and keep separate handlers,
 * but they describe the same item vocabulary in different casings (`file_change` / `fileChange`).
 * Only that shared vocabulary lives here; parsing stays with each protocol.
 */
function codexItemKey(item) {
    return typeof item?.type === 'string' ? item.type.replace(/[^a-z]/giu, '').toLowerCase() : '';
}

function isCodexFileItem(item) {
    return CODEX_FILE_ITEM_KEYS.has(codexItemKey(item));
}

function codexChangedPaths(item, rootPath) {
    if (!isCodexFileItem(item)) return [];
    const filePaths = typeof item.path === 'string' ? [item.path] : [];
    if (Array.isArray(item.changes)) filePaths.push(...item.changes.map((change) => change?.path));

    return normalizeChangedPaths(rootPath, filePaths);
}

/** Assistant messages, user echoes and reasoning reach the conversation elsewhere; skip them here. */
function codexTranscriptContent(item) {
    if (!item || CODEX_SILENT_ITEM_KEYS.has(codexItemKey(item))) return null;

    return normalizedContent(
        item.aggregated_output
        ?? item.aggregatedOutput
        ?? item.output
        ?? item.result
        ?? item.changes
        ?? item.command
        ?? item.path
        ?? item.name,
    );
}

function codexTranscriptEvents(item) {
    const content = codexTranscriptContent(item);

    return content ? [{ content, toolType: `tool.${item.type}` }] : [];
}

module.exports = { codexChangedPaths, codexTranscriptEvents };
