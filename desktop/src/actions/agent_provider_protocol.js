const { normalizeAgentTokenUsage } = require('../../../shared/agent_usage_math.mjs');
const { claudeAssistantText, claudeChangedPaths, claudeTranscriptEvents, claudeUsage } = require('./agent_claude_events');
const { codexChangedPaths, codexTranscriptEvents } = require('./agent_codex_events');
const { JsonLineBuffer } = require('./agent_event_utils');

const MISSING_SESSION_CODES = new Set([
    'conversation_not_found',
    'invalid_session_id',
    'resume_session_not_found',
    'session_not_found',
    'thread_not_found',
]);

// Codex exec reports cached tokens as a subset of input_tokens; subtracting here makes inputTokens
// fresh-only, matching how claude reports them.
function codexUsage(event) {
    const usage = event.usage;
    if (event.type !== 'turn.completed' || !usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
    const cachedInputTokens = usage.cached_input_tokens;

    return normalizeAgentTokenUsage({
        cachedInputTokens,
        inputTokens: (usage.input_tokens ?? 0) - (cachedInputTokens ?? 0),
        outputTokens: usage.output_tokens,
        reasoningTokens: usage.reasoning_output_tokens,
    });
}

function providerUsage(agent, event) {
    return agent === 'codex' ? codexUsage(event) : claudeUsage(event);
}

function providerChangedPaths(agent, event, rootPath) {
    if (agent !== 'codex') return claudeChangedPaths(event, rootPath);
    if (event.type !== 'item.completed') return [];

    return codexChangedPaths(event.item, rootPath);
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
        this.lines = new JsonLineBuffer(agent, (line) => this.parseLine(line));
        this.onEvent = onEvent;
        this.onMalformed = onMalformed;
        this.rootPath = rootPath;
        this.turnStarted = false;
    }

    push(chunk) {
        this.lines.push(chunk);
    }

    finish() {
        this.lines.finish();
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
