const { validateAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');
const {
    ClaudeFileResultDecoder,
    accumulatedClaudeUsage,
    claudeAssistantText,
    claudeTranscriptEvents,
    claudeUsage,
    recordClaudeAssistantUsage,
} = require('./agent_claude_events');
const { codexTranscriptEvents } = require('./agent_codex_events');
const { normalizeCodexEvent } = require('./agent_codex_event');
const { JsonLineBuffer } = require('./agent_event_utils');

const MISSING_SESSION_CODES = new Set([
    'conversation_not_found',
    'invalid_session_id',
    'resume_session_not_found',
    'session_not_found',
    'thread_not_found',
]);

// Codex exec reports one `turn.completed` per turn whose counters already cover every model request
// in that turn, so this needs no accumulation of its own (the streaming app-server protocol does;
// see `codexTurnCounters`). Cached tokens are a subset of input_tokens and reasoning a subset of
// output_tokens; subtracting here makes the buckets disjoint and inputTokens fresh-only, matching
// how claude reports them.
function codexUsage(event) {
    const usage = event.usage;
    if (event.type !== 'turn.completed' || !usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
    const cachedInputTokens = usage.cached_input_tokens;

    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;
    const reasoningTokens = usage.reasoning_output_tokens ?? 0;

    return validateAgentTokenUsage({
        cachedInputTokens: cachedInputTokens ?? 0,
        inputTokens: inputTokens - (cachedInputTokens ?? 0),
        outputTokens: outputTokens - reasoningTokens,
        reasoningTokens,
    }, usage.total_tokens);
}

function providerTranscriptEvents(agent, event) {
    if (agent !== 'codex') return claudeTranscriptEvents(event);
    if (event.type !== 'item.completed' || !event.item) return [];

    return codexTranscriptEvents(event.item);
}

function eventCodes(event) {
    return [event.code, event.error?.code, event.error?.type, event.result?.code, event.subtype]
        .filter((value) => typeof value === 'string')
        .map((value) => value.toLowerCase());
}

function codexAssistantText(event) {
    if (event.type !== 'item.completed' || event.item?.type !== 'agent_message') return '';

    return typeof event.item.text === 'string' ? event.item.text : '';
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

function isTurnEvent(agent, event) {
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
        this.lines = new JsonLineBuffer(agent, (line) => this.parseLine(line));
        this.onEvent = onEvent;
        this.onMalformed = onMalformed;
        this.rootPath = rootPath;
        this.turnStarted = false;
        this.claudeFileResultDecoder = agent === 'claude' ? new ClaudeFileResultDecoder(rootPath) : null;
        this.claudeMessageUsages = new Map();
    }

    push(chunk) {
        this.lines.push(chunk);
    }

    finish() {
        this.lines.finish();
    }

    providerUsage(event) {
        if (this.agent === 'codex') return codexUsage(event);
        const isSubAgentResult = typeof event.parent_tool_use_id === 'string' && event.parent_tool_use_id.length > 0;
        if (event.type !== 'result' || isSubAgentResult) return null;
        const usage = claudeUsage(event, accumulatedClaudeUsage(this.claudeMessageUsages));
        this.claudeMessageUsages.clear();

        return usage;
    }

    parseLine(line) {
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
        this.turnStarted = this.turnStarted || isTurnEvent(this.agent, event);
        if (this.agent === 'claude') recordClaudeAssistantUsage(this.claudeMessageUsages, event);
        const usage = this.providerUsage(event);
        const assistantText = this.agent === 'codex' ? codexAssistantText(event) : claudeAssistantText(event);
        this.onEvent({
            assistantText,
            conversationId: providerConversationId(this.agent, event),
            errorText: providerErrorText(this.agent, event),
            missingSession,
            providerEvents: this.agent === 'codex' && event.type === 'item.completed'
                ? [normalizeCodexEvent(event.item, 'completed', this.rootPath)].filter((providerEvent) => providerEvent !== null)
                : this.claudeFileResultDecoder?.decode(event) ?? [],
            transcriptEvents: providerTranscriptEvents(this.agent, event),
            turnStarted: this.turnStarted,
            usage,
        });
    }
}

function createAgentProviderProtocolParser(agent, onEvent, onMalformed, rootPath) {
    if (agent !== 'codex' && agent !== 'claude') return null;

    return new AgentProviderProtocolParser(agent, onEvent, onMalformed, rootPath);
}

module.exports = { createAgentProviderProtocolParser, isMissingSession };
