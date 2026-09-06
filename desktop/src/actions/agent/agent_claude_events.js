const { sumAgentTokenUsage, validateAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');
const { boundedAgentResult } = require('../../../../shared/agent_conversations.mjs');
const { normalizeChangedPaths, normalizedContent } = require('./agent_event_utils');
const { countLineChanges, countPatchLines } = require('./agent_file_change');

const CLAUDE_FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
const CLAUDE_PATCH_FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);

function claudeFilePath(block) {
    if (!block || !CLAUDE_FILE_TOOLS.has(block.name)) return null;
    const filePath = block.name === 'NotebookEdit' ? block.input?.notebook_path : block.input?.file_path;

    return typeof filePath === 'string' && filePath.length > 0 ? filePath : null;
}

function claudeFileToolEvent(block, status = 'inProgress', rootPath) {
    const filePath = claudeFilePath(block);
    if (typeof block?.id !== 'string' || block.id.length === 0 || !filePath) return null;

    return {
        content: filePath,
        label: block.name,
        paths: rootPath ? normalizeChangedPaths(rootPath, [filePath]) : [],
        providerItemId: block.id,
        status,
        type: 'fileChange',
    };
}

function countStructuredPatch(structuredPatch) {
    if (!Array.isArray(structuredPatch)) return null;

    const total = { deletions: 0, insertions: 0 };
    for (const hunk of structuredPatch) {
        if (!hunk || typeof hunk !== 'object' || Array.isArray(hunk)) return null;
        const usage = countPatchLines(hunk.lines);
        if (!usage) return null;
        total.deletions += usage.deletions;
        total.insertions += usage.insertions;
    }

    return total;
}

function countNotebookEdit(result) {
    if (result.edit_mode === 'insert') return countLineChanges('', result.new_source);
    if (result.edit_mode === 'delete') return countLineChanges(result.old_source, '');
    if (result.edit_mode === 'replace') return countLineChanges(result.old_source, result.new_source);

    return null;
}

function claudeFileResultUsage(toolName, result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
    if (CLAUDE_PATCH_FILE_TOOLS.has(toolName)) return countStructuredPatch(result.structuredPatch);
    if (toolName === 'NotebookEdit') return countNotebookEdit(result);

    return null;
}

class ClaudeFileResultDecoder {
    constructor(rootPath) {
        this.fileTools = new Map();
        this.rootPath = rootPath;
    }

    decode(event) {
        if (event.type === 'assistant') return this.decodeToolUses(event);
        if (event.type === 'user') return this.decodeToolResults(event);

        return [];
    }

    decodeToolUses(event) {
        if (!Array.isArray(event.message?.content)) return [];

        return event.message.content
            .filter((block) => block?.type === 'tool_use')
            .map((block) => {
                const fileEvent = claudeFileToolEvent(block, 'inProgress', this.rootPath);
                if (fileEvent) this.fileTools.set(block.id, structuredClone(block));

                return fileEvent;
            })
            .filter((fileEvent) => fileEvent !== null);
    }

    decodeToolResults(event) {
        if (!Array.isArray(event.message?.content)) return [];
        const resultBlocks = event.message.content.filter((block) => block?.type === 'tool_result');
        const appliedResult = resultBlocks.length === 1 ? event.tool_use_result : null;

        return resultBlocks
            .map((block) => this.decodeToolResult(block, appliedResult))
            .filter((fileEvent) => fileEvent !== null);
    }

    decodeToolResult(block, appliedResult) {
        if (typeof block.tool_use_id !== 'string') return null;
        const tool = this.fileTools.get(block.tool_use_id);
        if (!tool) return null;
        this.fileTools.delete(block.tool_use_id);
        const status = block.is_error === true ? 'failed' : 'completed';
        const fileEvent = claudeFileToolEvent(tool, status, this.rootPath);
        const output = normalizedContent(block.content);
        if (output !== null) fileEvent.output = boundedAgentResult(output);
        if (status !== 'completed') return fileEvent;
        const usage = claudeFileResultUsage(tool.name, appliedResult);

        return usage ? { ...fileEvent, ...usage } : fileEvent;
    }

    reset() {
        this.fileTools.clear();
    }
}

/**
 * Claude speaks the same stream-json wire format on both the one-shot and the streaming path, so
 * every decoder here is shared by `agent_provider_protocol` and `ClaudeStreamingAdapter`. Keep it
 * that way: a decoder that lives in only one of them silently gives the two paths different output
 * for identical agent behaviour.
 */
function claudeAssistantText(event) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return '';

    return event.message.content
        .filter(({ type }) => type === 'text')
        .map(({ text }) => text)
        .filter((text) => typeof text === 'string')
        .join('');
}

/** Tool calls and their results, so the transcript shows what ran as well as what came back. */
function claudeTranscriptEvents(event) {
    if (!Array.isArray(event.message?.content)) return [];
    if (event.type === 'assistant') {
        return event.message.content
            .filter((block) => block?.type === 'tool_use')
            .map((block) => ({ content: JSON.stringify(block.input ?? {}), toolType: `tool.${block.name}` }));
    }
    if (event.type === 'user') {
        return event.message.content
            .filter((block) => block?.type === 'tool_result')
            .map((block) => ({ content: normalizedContent(block.content), toolType: 'tool.result' }))
            .filter(({ content }) => content !== null);
    }

    return [];
}

const CLAUDE_TOKEN_FIELDS = [
    'cache_creation_input_tokens',
    'cache_read_input_tokens',
    'input_tokens',
    'output_tokens',
];
const CLAUDE_USAGE_FIELD_NAMES = {
    cache_creation_input_tokens: 'cachedInputTokens',
    cache_read_input_tokens: 'cachedInputTokens',
    input_tokens: 'inputTokens',
    output_tokens: 'outputTokens',
};

function validatePresentClaudeUsageFields(usage) {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return;
    for (const fieldName of CLAUDE_TOKEN_FIELDS) {
        if (!Object.hasOwn(usage, fieldName)) continue;
        const value = usage[fieldName];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            throw new Error(`Invalid provider token usage ${CLAUDE_USAGE_FIELD_NAMES[fieldName]}`);
        }
    }
}

function hasCompleteClaudeUsage(usage) {
    return !!usage
        && typeof usage === 'object'
        && !Array.isArray(usage)
        && CLAUDE_TOKEN_FIELDS.every((fieldName) => Object.hasOwn(usage, fieldName));
}

// Claude folds thinking into output_tokens, so reasoningTokens is always 0, and reports cache
// creation and cache reads as buckets alongside a cache-free input_tokens.
function normalizeClaudeUsage(usage, costUsd, providerTotalTokens) {
    return validateAgentTokenUsage({
        cachedInputTokens: usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
        ...(costUsd !== undefined ? { costUsd } : {}),
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        reasoningTokens: 0,
    }, providerTotalTokens);
}

function recordClaudeAssistantUsage(messageUsages, event) {
    validatePresentClaudeUsageFields(event.message?.usage);
    if (event.type !== 'assistant' || !hasCompleteClaudeUsage(event.message?.usage)) return;
    const messageId = event.message.id;
    if (typeof messageId !== 'string' || messageId.length === 0) return;
    const streamKey = typeof event.parent_tool_use_id === 'string' ? event.parent_tool_use_id : 'root';
    messageUsages.set(`${streamKey}:${messageId}`, normalizeClaudeUsage(event.message.usage));
}

function accumulatedClaudeUsage(messageUsages) {
    if (messageUsages.size === 0) return null;

    return sumAgentTokenUsage([...messageUsages.values()]);
}

/** Prefer Claude's complete turn result, falling back to deduplicated per-request message usage. */
function claudeUsage(event, fallbackUsage = null) {
    if (event.type !== 'result') return null;
    validatePresentClaudeUsageFields(event.usage);
    if (hasCompleteClaudeUsage(event.usage)) {
        return normalizeClaudeUsage(event.usage, event.total_cost_usd, event.usage.total_tokens);
    }
    if (!fallbackUsage) return null;

    return validateAgentTokenUsage({
        ...fallbackUsage,
        ...(event.total_cost_usd !== undefined ? { costUsd: event.total_cost_usd } : {}),
    }, fallbackUsage.totalTokens);
}

module.exports = {
    ClaudeFileResultDecoder,
    accumulatedClaudeUsage,
    claudeAssistantText,
    claudeFileResultUsage,
    claudeFileToolEvent,
    claudeTranscriptEvents,
    claudeUsage,
    recordClaudeAssistantUsage,
};
