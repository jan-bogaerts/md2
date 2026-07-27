const path = require('node:path');
const { normalizePath } = require('../../../shared/path_utils.mjs');
const { isMissingSession } = require('./agent_provider_protocol');

const CODEX_CLIENT_NAME = 'md2';
const CODEX_CLIENT_VERSION = '1';
const CODEX_MISSING_THREAD_ERROR_CODE = -32600;
const CLAUDE_FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
const CLAUDE_QUESTION_TOOL = 'AskUserQuestion';

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

function claudeChangedPaths(event, rootPath) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return [];

    return [...new Set(event.message.content
        .filter((block) => block?.type === 'tool_use' && CLAUDE_FILE_TOOLS.has(block.name))
        .map(({ input, name }) => name === 'NotebookEdit' ? input?.notebook_path : input?.file_path)
        .map((filePath) => normalizeChangedPath(rootPath, filePath))
        .filter((filePath) => filePath !== null))];
}

function claudeTranscriptEvents(event) {
    if (!Array.isArray(event.message?.content)) return [];
    if (event.type === 'assistant') {
        return event.message.content
            .filter((block) => block?.type === 'tool_use')
            .map((block) => ({ content: JSON.stringify(block.input ?? {}), eventType: `tool.${block.name}` }));
    }
    if (event.type === 'user') {
        return event.message.content
            .filter((block) => block?.type === 'tool_result')
            .map((block) => ({
                content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? ''),
                eventType: 'tool.result',
            }));
    }

    return [];
}

function claudeQuestionRequest(event) {
    if (event.type !== 'control_request' || event.request?.subtype !== 'can_use_tool') return null;
    if (event.request.tool_name !== CLAUDE_QUESTION_TOOL || !Array.isArray(event.request.input?.questions)) return null;

    const questions = event.request.input.questions.map((question, index) => ({
        ...question,
        id: question.id ?? `claude-question-${index}`,
    }));

    return {
        input: event.request.input,
        questions,
        requestId: event.request_id,
        toolUseId: event.request.tool_use_id,
    };
}

function claudeControlResponse(requestId, response) {
    return {
        response: { request_id: requestId, response, subtype: 'success' },
        type: 'control_response',
    };
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

function isClaudeMissingSessionResult(event, providerConversationId) {
    if (!providerConversationId || event.type !== 'result' || event.is_error !== true) return false;
    if (event.session_id !== providerConversationId || !Array.isArray(event.errors)) return false;

    return event.errors.includes(`No conversation found with session ID: ${providerConversationId}`);
}

class ClaudeStreamingAdapter {
    constructor(writeLine, onEvent, rootPath, providerConversationId) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
        this.pendingQuestions = new Map();
        this.providerConversationId = providerConversationId;
        this.rootPath = rootPath;
        this.turnStarted = false;
        /** Claude emits whole assistant messages, so the adapter adds the blank line between them. */
        this.turnHasAssistantText = false;
    }

    async start(prompt) {
        await this.sendMessage(prompt);
    }

    async sendMessage(content) {
        await this.writeLine(claudeUserMessage(requireMessage(content)));
    }

    async answerQuestion(requestId, answers) {
        const pendingQuestion = this.pendingQuestions.get(requestId);
        if (!pendingQuestion) throw new Error(`Unknown Claude question request id: ${requestId}`);
        const mappedAnswers = Object.fromEntries(pendingQuestion.questions.map(({ id, question }) => {
            if (!Object.hasOwn(answers, id)) throw new Error(`Missing answer for Claude question: ${id}`);

            return [question, answers[id]];
        }));
        const updatedInput = { ...pendingQuestion.input, answers: mappedAnswers };
        const response = { behavior: 'allow', toolUseID: pendingQuestion.toolUseId, updatedInput };
        await this.writeLine(claudeControlResponse(requestId, response));
        this.pendingQuestions.delete(requestId);
    }

    async handleMessage(event) {
        const questionRequest = claudeQuestionRequest(event);
        if (questionRequest) {
            this.pendingQuestions.set(questionRequest.requestId, questionRequest);
            await this.onEvent({
                questions: questionRequest.questions,
                requestId: questionRequest.requestId,
                type: 'question',
            });
            return;
        }
        if (event.type === 'control_request' && event.request?.subtype === 'can_use_tool') {
            const response = {
                behavior: 'deny',
                message: 'Interactive tool approval is not supported',
                toolUseID: event.request.tool_use_id,
            };
            await this.writeLine(claudeControlResponse(event.request_id, response));
            return;
        }
        if (event.type === 'system' && typeof event.session_id === 'string') {
            await this.onEvent({ conversationId: event.session_id, type: 'sessionStarted' });
        }
        const startsTurn = event.type === 'assistant' || event.type === 'user';
        if (!this.turnStarted && startsTurn) await this.onEvent({ type: 'turnStarted' });
        this.turnStarted = this.turnStarted || startsTurn;
        const assistantText = claudeAssistantText(event);
        if (assistantText.length > 0) {
            const separator = this.turnHasAssistantText ? '\n\n' : '';
            this.turnHasAssistantText = true;
            await this.onEvent({ content: `${separator}${assistantText}`, type: 'assistant' });
        }
        const changedPaths = claudeChangedPaths(event, this.rootPath);
        if (changedPaths.length > 0) await this.onEvent({ paths: changedPaths, type: 'changedPaths' });
        for (const transcriptEvent of claudeTranscriptEvents(event)) {
            await this.onEvent({ ...transcriptEvent, type: 'transcript' });
        }
        if (event.type === 'result') {
            const error = event.is_error === true
                ? String(event.error ?? event.result ?? event.message ?? event.errors?.join('\n') ?? 'Claude turn failed')
                : null;
            const missingSession = !this.turnStarted && (
                isClaudeMissingSessionResult(event, this.providerConversationId)
                || isMissingSession('claude', event, this.turnStarted)
            );
            this.turnHasAssistantText = false;
            await this.onEvent({ error, missingSession, type: 'turnCompleted', usage: claudeUsage(event) });
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

function isCodexMissingThreadError(error, providerConversationId) {
    if (!providerConversationId || error?.code !== CODEX_MISSING_THREAD_ERROR_CODE) return false;

    return error.message === `no rollout found for thread id ${providerConversationId}`;
}

class CodexStreamingAdapter {
    constructor(writeLine, onEvent, rootPath, providerConversationId) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
        this.providerConversationId = providerConversationId;
        this.rootPath = rootPath;
        this.activeTurnId = null;
        this.initialPrompt = null;
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.threadId = null;
        this.turnUsage = null;
    }

    async start(prompt) {
        this.initialPrompt = requireMessage(prompt);
        await this.sendRequest('initialize', {
            capabilities: { experimentalApi: true },
            clientInfo: { name: CODEX_CLIENT_NAME, version: CODEX_CLIENT_VERSION },
        }, 'initialize');
    }

    async sendMessage(content) {
        const input = codexInput(content);
        if (!this.threadId) throw new Error('Codex streaming thread is not ready');
        if (this.activeTurnId) {
            await this.sendRequest('turn/steer', {
                expectedTurnId: this.activeTurnId,
                input,
                threadId: this.threadId,
            });
            return;
        }
        await this.sendRequest('turn/start', { input, threadId: this.threadId });
    }

    async answerQuestion(requestId, answers) {
        if (requestId === null || requestId === undefined) throw new Error('Missing Codex question request id');
        const normalizedAnswers = Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => [
            questionId,
            { answers: Array.isArray(answer) ? answer : [answer] },
        ]));
        await this.writeLine({ id: requestId, result: { answers: normalizedAnswers } });
    }

    async sendRequest(method, params, purpose = null) {
        const id = this.nextRequestId;
        this.nextRequestId += 1;
        if (purpose) this.pendingRequests.set(id, purpose);
        try {
            await this.writeLine({ id, method, params });
        } catch (error) {
            this.pendingRequests.delete(id);
            throw error;
        }
    }

    async handleMessage(message) {
        if (Object.hasOwn(message, 'id') && !message.method) {
            await this.handleResponse(message);
            return;
        }
        if (message.method === 'item/tool/requestUserInput') {
            await this.onEvent({ questions: message.params.questions, requestId: message.id, type: 'question' });
            return;
        }
        await this.handleNotification(message.method, message.params ?? {});
    }

    async handleResponse(message) {
        const purpose = this.pendingRequests.get(message.id);
        if (!purpose) {
            if (message.error) await this.onEvent({ content: message.error.message ?? 'Codex request failed', type: 'fatal' });
            return;
        }
        this.pendingRequests.delete(message.id);
        if (message.error) {
            const content = message.error.message ?? `Codex ${purpose} failed`;
            if (purpose === 'threadResume') {
                const missingSession = isCodexMissingThreadError(message.error, this.providerConversationId)
                    || isMissingSession('codex', { error: message.error, type: 'error' }, false);
                await this.onEvent({ content, missingSession, type: 'sessionFailed' });
                return;
            }
            await this.onEvent({ content, type: 'fatal' });
            return;
        }
        if (purpose === 'initialize') {
            await this.writeLine({ method: 'initialized', params: {} });
            if (this.providerConversationId) {
                await this.sendRequest('thread/resume', {
                    cwd: this.rootPath,
                    threadId: this.providerConversationId,
                }, 'threadResume');
                return;
            }
            await this.sendRequest('thread/start', { cwd: this.rootPath }, 'threadStart');
            return;
        }
        if (purpose === 'threadStart' || purpose === 'threadResume') {
            this.threadId = message.result?.thread?.id ?? message.result?.threadId ?? this.providerConversationId;
            if (!this.threadId) throw new Error('Codex app-server did not return a thread id');
            await this.onEvent({ conversationId: this.threadId, type: 'sessionStarted' });
            await this.sendMessage(this.initialPrompt);
        }
    }

    async handleNotification(method, params) {
        if (method === 'turn/started') {
            this.activeTurnId = params.turn?.id ?? params.turnId;
            await this.onEvent({ turnId: this.activeTurnId, type: 'turnStarted' });
            return;
        }
        if (method === 'item/agentMessage/delta') {
            await this.onEvent({ content: params.delta ?? '', type: 'assistant' });
            return;
        }
        if (method === 'thread/tokenUsage/updated') {
            this.turnUsage = codexUsage(params);
            return;
        }
        if (method === 'item/completed') {
            const changedPaths = codexChangedPaths(params.item, this.rootPath);
            if (changedPaths.length > 0) await this.onEvent({ paths: changedPaths, type: 'changedPaths' });
            const content = codexTranscriptContent(params.item);
            if (content) await this.onEvent({ content, eventType: `tool.${params.item.type}`, type: 'transcript' });
            return;
        }
        if (method === 'error') {
            await this.onEvent({ content: params.error?.message ?? 'Codex turn failed', type: 'fatal' });
            return;
        }
        if (method === 'turn/completed') {
            const error = params.turn?.status === 'failed'
                ? params.turn.error?.message ?? 'Codex turn failed'
                : null;
            this.activeTurnId = null;
            await this.onEvent({ error, type: 'turnCompleted', usage: this.turnUsage });
            this.turnUsage = null;
        }
    }
}

function createAgentStreamingAdapter(agent, writeLine, onEvent, rootPath, providerConversationId = null) {
    if (agent === 'claude') return new ClaudeStreamingAdapter(writeLine, onEvent, rootPath, providerConversationId);
    if (agent === 'codex') return new CodexStreamingAdapter(writeLine, onEvent, rootPath, providerConversationId);

    throw new Error(`Agent profile does not support streaming: ${agent}`);
}

module.exports = { createAgentStreamingAdapter };
