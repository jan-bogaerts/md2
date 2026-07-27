const path = require('node:path');
const { normalizePath } = require('../../../shared/path_utils.mjs');

const MISSING_SESSION_CODES = new Set([
    'conversation_not_found',
    'invalid_session_id',
    'resume_session_not_found',
    'session_not_found',
    'thread_not_found',
]);
const CLAUDE_FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
const CODEX_FILE_ITEM_TYPES = new Set(['file', 'file_change', 'patch']);

function usageNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizedUsage(inputTokens, cachedInputTokens, outputTokens, reasoningTokens, costUsd) {
    const usage = {
        cachedInputTokens: usageNumber(cachedInputTokens),
        inputTokens: usageNumber(inputTokens),
        outputTokens: usageNumber(outputTokens),
        reasoningTokens: usageNumber(reasoningTokens),
    };
    usage.totalTokens = usage.inputTokens + usage.cachedInputTokens + usage.outputTokens + usage.reasoningTokens;
    if (typeof costUsd === 'number' && Number.isFinite(costUsd) && costUsd >= 0) usage.costUsd = costUsd;

    return usage;
}

// Bucket semantics differ per provider: codex reports cached tokens as a subset of input_tokens
// (subtracted here so inputTokens is fresh-only, like claude), and only codex reports reasoning
// tokens separately (claude folds thinking into output_tokens, so its reasoningTokens is always 0).
function providerUsage(agent, event) {
    const usage = event.usage;
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;

    if (agent === 'codex' && event.type === 'turn.completed') {
        return normalizedUsage(
            usageNumber(usage.input_tokens) - usageNumber(usage.cached_input_tokens),
            usage.cached_input_tokens,
            usage.output_tokens,
            usage.reasoning_output_tokens,
        );
    }
    if (agent === 'claude' && event.type === 'result') {
        const cachedInputTokens = usageNumber(usage.cache_creation_input_tokens) + usageNumber(usage.cache_read_input_tokens);

        return normalizedUsage(usage.input_tokens, cachedInputTokens, usage.output_tokens, 0, event.total_cost_usd);
    }

    return null;
}

function normalizeChangedPath(rootPath, filePath) {
    if (typeof rootPath !== 'string' || rootPath.length === 0) return null;
    if (typeof filePath !== 'string' || filePath.length === 0) return null;
    const resolvedRoot = path.resolve(rootPath);
    const resolvedPath = path.resolve(resolvedRoot, filePath);
    const relativePath = path.relative(resolvedRoot, resolvedPath);
    if (relativePath.length === 0 || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return null;

    return normalizePath(relativePath);
}

function claudeChangedPaths(event) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return [];

    return event.message.content
        .filter((block) => block?.type === 'tool_use' && CLAUDE_FILE_TOOLS.has(block.name))
        .map(({ input, name }) => name === 'NotebookEdit' ? input?.notebook_path : input?.file_path)
        .filter((filePath) => typeof filePath === 'string');
}

function codexChangedPaths(event) {
    if (event.type !== 'item.completed' || !CODEX_FILE_ITEM_TYPES.has(event.item?.type)) return [];
    const changedPaths = typeof event.item.path === 'string' ? [event.item.path] : [];
    if (!Array.isArray(event.item.changes)) return changedPaths;

    return [...changedPaths, ...event.item.changes
        .map((change) => change?.path)
        .filter((filePath) => typeof filePath === 'string')];
}

function providerChangedPaths(agent, event, rootPath) {
    const paths = agent === 'codex' ? codexChangedPaths(event) : claudeChangedPaths(event);

    return [...new Set(paths.map((filePath) => normalizeChangedPath(rootPath, filePath)).filter((filePath) => filePath !== null))];
}

function eventCodes(event) {
    return [event.code, event.error?.code, event.error?.type, event.result?.code, event.subtype]
        .filter((value) => typeof value === 'string')
        .map((value) => value.toLowerCase());
}

function claudeAssistantText(event) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return '';

    return event.message.content
        .filter(({ type }) => type === 'text')
        .map(({ text }) => text)
        .filter((text) => typeof text === 'string')
        .join('');
}

function codexAssistantText(event) {
    if (event.type !== 'item.completed' || event.item?.type !== 'agent_message') return '';

    return typeof event.item.text === 'string' ? event.item.text : '';
}

function normalizedContent(value) {
    if (value === undefined || value === null) return null;
    const content = typeof value === 'string' ? value : JSON.stringify(value);

    return content.length > 0 ? content : null;
}

function codexTranscriptEvents(event) {
    if (event.type !== 'item.completed' || !event.item) return [];
    if (event.item.type === 'agent_message' || event.item.type === 'reasoning' || event.item.type === 'error') return [];
    const content = normalizedContent(
        event.item.aggregated_output
        ?? event.item.output
        ?? event.item.result
        ?? event.item.changes
        ?? event.item.command
        ?? event.item.path
        ?? event.item.name,
    );

    return content ? [{ content, type: `tool.${event.item.type}` }] : [];
}

function claudeTranscriptEvents(event) {
    if (event.type !== 'user' || !Array.isArray(event.message?.content)) return [];

    return event.message.content
        .filter((block) => block?.type === 'tool_result')
        .map(({ content }) => normalizedContent(content))
        .filter((content) => content !== null)
        .map((content) => ({ content, type: 'tool.result' }));
}

function providerTranscriptEvents(agent, event) {
    return agent === 'codex' ? codexTranscriptEvents(event) : claudeTranscriptEvents(event);
}

function nestedErrorMessage(value) {
    if (typeof value === 'string') {
        try {
            return nestedErrorMessage(JSON.parse(value));
        } catch {
            return value;
        }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

    return nestedErrorMessage(value.message ?? value.error ?? value.result);
}

function providerErrorText(agent, event) {
    if (event.type === 'error') return nestedErrorMessage(event.message ?? event.error);
    if (agent === 'codex' && event.type === 'turn.failed') return nestedErrorMessage(event.error);
    if (agent === 'codex' && event.type === 'item.completed' && event.item?.type === 'error') {
        return nestedErrorMessage(event.item.message ?? event.item.error);
    }
    if (agent === 'claude' && event.type === 'result' && event.is_error === true) {
        return nestedErrorMessage(event.error ?? event.result ?? event.message);
    }

    return '';
}

function providerConversationId(agent, event) {
    if (agent === 'codex' && event.type === 'thread.started') return event.thread_id ?? event.thread?.thread_id ?? null;
    if (agent === 'claude' && typeof event.session_id === 'string') return event.session_id;

    return null;
}

function isTurnActivity(agent, event) {
    if (agent === 'codex') return event.type === 'turn.started' || event.type === 'item.started' || event.type === 'item.completed';
    if (agent === 'claude') return event.type === 'assistant' || event.type === 'user';

    return false;
}

function isMissingSession(agent, event, turnStarted) {
    if (turnStarted) return false;
    if (agent !== 'codex' && agent !== 'claude') return false;
    const isFailureEvent = event.type === 'error' || (agent === 'claude' && event.type === 'result' && event.is_error === true);

    return isFailureEvent && eventCodes(event).some((code) => MISSING_SESSION_CODES.has(code));
}

class AgentProviderProtocolParser {
    constructor(agent, onEvent, onMalformed, rootPath) {
        this.agent = agent;
        this.buffer = '';
        this.onEvent = onEvent;
        this.onMalformed = onMalformed;
        this.rootPath = rootPath;
        this.turnStarted = false;
    }

    push(chunk) {
        this.buffer += chunk.toString();
        const lines = this.buffer.split(/\r?\n/u);
        this.buffer = lines.pop() ?? '';
        for (const line of lines) this.parseLine(line);
    }

    finish() {
        if (this.buffer.length > 0) this.parseLine(this.buffer);
        this.buffer = '';
    }

    parseLine(line) {
        if (line.trim().length === 0) return;

        let event;
        try {
            event = JSON.parse(line);
        } catch {
            this.onMalformed(line);
            return;
        }
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
            this.onMalformed(line);
            return;
        }

        const missingSession = isMissingSession(this.agent, event, this.turnStarted);
        this.turnStarted = this.turnStarted || isTurnActivity(this.agent, event);
        const assistantText = this.agent === 'codex' ? codexAssistantText(event) : claudeAssistantText(event);
        this.onEvent({
            assistantText,
            changedPaths: providerChangedPaths(this.agent, event, this.rootPath),
            conversationId: providerConversationId(this.agent, event),
            errorText: providerErrorText(this.agent, event),
            missingSession,
            transcriptEvents: providerTranscriptEvents(this.agent, event),
            turnStarted: this.turnStarted,
            usage: providerUsage(this.agent, event),
        });
    }
}

function createAgentProviderProtocolParser(agent, onEvent, onMalformed, rootPath) {
    if (agent !== 'codex' && agent !== 'claude') return null;

    return new AgentProviderProtocolParser(agent, onEvent, onMalformed, rootPath);
}

module.exports = { createAgentProviderProtocolParser, isMissingSession };
