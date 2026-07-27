const path = require('node:path');
const { normalizePath } = require('../../../shared/path_utils.mjs');

const CODEX_CLIENT_NAME = 'md2';
const CODEX_CLIENT_VERSION = '1';

function requireMessage(content) {
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Streaming agent message is required');

    return content;
}

function normalizeChangedPath(rootPath, filePath) {
    if (typeof filePath !== 'string' || filePath.length === 0) return null;
    const resolvedRoot = path.resolve(rootPath);
    const resolvedPath = path.resolve(resolvedRoot, filePath);
    const relativePath = path.relative(resolvedRoot, resolvedPath);
    if (relativePath.length === 0 || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return null;

    return normalizePath(relativePath);
}

function claudeUserMessage(content) {
    return { message: { content, role: 'user' }, type: 'user' };
}

function claudeAssistantText(event) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return '';

    return event.message.content
        .filter(({ type }) => type === 'text')
        .map(({ text }) => text)
        .filter((text) => typeof text === 'string')
        .join('');
}

function claudeQuestions(event) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return [];
    const questionTool = event.message.content.find((block) => (
        block?.type === 'tool_use'
        && (block.name === 'AskUserQuestion' || block.name === 'RequestUserInput')
    ));

    return Array.isArray(questionTool?.input?.questions) ? questionTool.input.questions : [];
}

function claudeUsage(event) {
    if (event.type !== 'result' || !event.usage) return null;
    const cachedInputTokens = (event.usage.cache_creation_input_tokens ?? 0) + (event.usage.cache_read_input_tokens ?? 0);
    const usage = {
        cachedInputTokens,
        inputTokens: event.usage.input_tokens ?? 0,
        outputTokens: event.usage.output_tokens ?? 0,
        reasoningTokens: 0,
    };
    usage.totalTokens = usage.inputTokens + usage.cachedInputTokens + usage.outputTokens;
    if (typeof event.total_cost_usd === 'number') usage.costUsd = event.total_cost_usd;

    return usage;
}

class ClaudeStreamingAdapter {
    constructor(writeLine, onEvent) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
    }

    start(prompt) {
        this.sendMessage(prompt);
    }

    sendMessage(content) {
        this.writeLine(claudeUserMessage(requireMessage(content)));
    }

    answerQuestion(_requestId, answers) {
        const answerText = Object.entries(answers)
            .map(([questionId, answer]) => `${questionId}: ${Array.isArray(answer) ? answer.join(', ') : answer}`)
            .join('\n');
        this.sendMessage(answerText);
    }

    handleMessage(event) {
        if (event.type === 'system' && typeof event.session_id === 'string') {
            this.onEvent({ conversationId: event.session_id, type: 'sessionStarted' });
        }
        const assistantText = claudeAssistantText(event);
        if (assistantText.length > 0) this.onEvent({ content: assistantText, type: 'assistant' });
        const questions = claudeQuestions(event);
        if (questions.length > 0) this.onEvent({ questions, requestId: event.message.id ?? null, type: 'question' });
        if (event.type === 'result') {
            const error = event.is_error === true
                ? String(event.error ?? event.result ?? event.message ?? 'Claude turn failed')
                : null;
            this.onEvent({ error, type: 'turnCompleted', usage: claudeUsage(event) });
        }
    }
}

function codexInput(content) {
    return [{ text: requireMessage(content), type: 'text' }];
}

function codexUsage(params) {
    const usage = params.tokenUsage?.last;
    if (!usage) return null;

    return {
        cachedInputTokens: usage.cachedInputTokens ?? 0,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        reasoningTokens: usage.reasoningOutputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
    };
}

function codexChangedPaths(item, rootPath) {
    if (item?.type !== 'fileChange' || !Array.isArray(item.changes)) return [];

    return [...new Set(item.changes
        .map(({ path: filePath }) => normalizeChangedPath(rootPath, filePath))
        .filter((filePath) => filePath !== null))];
}

function codexTranscriptContent(item) {
    if (!item || item.type === 'agentMessage' || item.type === 'userMessage' || item.type === 'reasoning') return null;

    const content = item.aggregatedOutput ?? item.output ?? item.result ?? item.changes ?? item.command ?? item.path ?? item.name;
    if (content === undefined || content === null) return null;

    return typeof content === 'string' ? content : JSON.stringify(content);
}

class CodexStreamingAdapter {
    constructor(writeLine, onEvent, rootPath) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
        this.rootPath = rootPath;
        this.activeTurnId = null;
        this.initialPrompt = null;
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.threadId = null;
        this.turnUsage = null;
    }

    start(prompt) {
        this.initialPrompt = requireMessage(prompt);
        this.sendRequest('initialize', {
            capabilities: { experimentalApi: true },
            clientInfo: { name: CODEX_CLIENT_NAME, version: CODEX_CLIENT_VERSION },
        }, 'initialize');
    }

    sendMessage(content) {
        const input = codexInput(content);
        if (!this.threadId) throw new Error('Codex streaming thread is not ready');
        if (this.activeTurnId) {
            this.sendRequest('turn/steer', {
                expectedTurnId: this.activeTurnId,
                input,
                threadId: this.threadId,
            });
            return;
        }
        this.sendRequest('turn/start', { input, threadId: this.threadId });
    }

    answerQuestion(requestId, answers) {
        if (requestId === null || requestId === undefined) throw new Error('Missing Codex question request id');
        const normalizedAnswers = Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => [
            questionId,
            { answers: Array.isArray(answer) ? answer : [answer] },
        ]));
        this.writeLine({ id: requestId, result: { answers: normalizedAnswers } });
    }

    sendRequest(method, params, purpose = null) {
        const id = this.nextRequestId;
        this.nextRequestId += 1;
        if (purpose) this.pendingRequests.set(id, purpose);
        this.writeLine({ id, method, params });
    }

    handleMessage(message) {
        if (Object.hasOwn(message, 'id') && !message.method) {
            this.handleResponse(message);
            return;
        }
        if (message.method === 'item/tool/requestUserInput') {
            this.onEvent({ questions: message.params.questions, requestId: message.id, type: 'question' });
            return;
        }
        this.handleNotification(message.method, message.params ?? {});
    }

    handleResponse(message) {
        const purpose = this.pendingRequests.get(message.id);
        if (!purpose) {
            if (message.error) this.onEvent({ content: message.error.message ?? 'Codex request failed', type: 'error' });
            return;
        }
        this.pendingRequests.delete(message.id);
        if (message.error) {
            this.onEvent({ content: message.error.message ?? `Codex ${purpose} failed`, type: 'error' });
            return;
        }
        if (purpose === 'initialize') {
            this.writeLine({ method: 'initialized', params: {} });
            this.sendRequest('thread/start', { cwd: this.rootPath }, 'threadStart');
            return;
        }
        if (purpose === 'threadStart') {
            this.threadId = message.result?.thread?.id ?? message.result?.threadId;
            if (!this.threadId) throw new Error('Codex app-server did not return a thread id');
            this.onEvent({ conversationId: this.threadId, type: 'sessionStarted' });
            this.sendMessage(this.initialPrompt);
        }
    }

    handleNotification(method, params) {
        if (method === 'turn/started') {
            this.activeTurnId = params.turn?.id ?? params.turnId;
            this.onEvent({ turnId: this.activeTurnId, type: 'turnStarted' });
            return;
        }
        if (method === 'item/agentMessage/delta') {
            this.onEvent({ content: params.delta ?? '', type: 'assistant' });
            return;
        }
        if (method === 'thread/tokenUsage/updated') {
            this.turnUsage = codexUsage(params);
            return;
        }
        if (method === 'item/completed') {
            const changedPaths = codexChangedPaths(params.item, this.rootPath);
            if (changedPaths.length > 0) this.onEvent({ paths: changedPaths, type: 'changedPaths' });
            const content = codexTranscriptContent(params.item);
            if (content) this.onEvent({ content, eventType: `tool.${params.item.type}`, type: 'transcript' });
            return;
        }
        if (method === 'error') {
            this.onEvent({ content: params.error?.message ?? 'Codex turn failed', type: 'error' });
            return;
        }
        if (method === 'turn/completed') {
            const error = params.turn?.status === 'failed'
                ? params.turn.error?.message ?? 'Codex turn failed'
                : null;
            this.activeTurnId = null;
            this.onEvent({ error, type: 'turnCompleted', usage: this.turnUsage });
            this.turnUsage = null;
        }
    }
}

function createAgentStreamingAdapter(agent, writeLine, onEvent, rootPath) {
    if (agent === 'claude') return new ClaudeStreamingAdapter(writeLine, onEvent);
    if (agent === 'codex') return new CodexStreamingAdapter(writeLine, onEvent, rootPath);

    throw new Error(`Agent profile does not support streaming: ${agent}`);
}

module.exports = { createAgentStreamingAdapter };
