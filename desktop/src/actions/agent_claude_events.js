const { normalizeAgentTokenUsage } = require('../../../shared/agent_usage_math.mjs');
const { normalizeChangedPaths, normalizedContent } = require('./agent_event_utils');

const CLAUDE_FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);

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

function claudeChangedPaths(event, rootPath) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return [];

    const filePaths = event.message.content
        .filter((block) => block?.type === 'tool_use' && CLAUDE_FILE_TOOLS.has(block.name))
        .map(({ input, name }) => name === 'NotebookEdit' ? input?.notebook_path : input?.file_path);

    return normalizeChangedPaths(rootPath, filePaths);
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

// Claude folds thinking into output_tokens, so reasoningTokens is always 0, and reports cache
// creation and cache reads as buckets alongside a cache-free input_tokens.
function claudeUsage(event) {
    if (event.type !== 'result' || !event.usage || typeof event.usage !== 'object' || Array.isArray(event.usage)) return null;

    return normalizeAgentTokenUsage({
        cachedInputTokens: (event.usage.cache_creation_input_tokens ?? 0) + (event.usage.cache_read_input_tokens ?? 0),
        costUsd: event.total_cost_usd,
        inputTokens: event.usage.input_tokens,
        outputTokens: event.usage.output_tokens,
        reasoningTokens: 0,
    });
}

module.exports = { claudeAssistantText, claudeChangedPaths, claudeTranscriptEvents, claudeUsage };
