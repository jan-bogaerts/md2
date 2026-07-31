const { normalizeAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');
const { claudeAssistantText, claudeChangedPaths, claudeTranscriptEvents, claudeUsage } = require('./agent_claude_events');
const { codexChangedPaths } = require('./agent_codex_events');
const { diagnosticActivity, normalizeCodexActivity, systemActivity } = require('./agent_codex_activity');
const { isMissingSession } = require('./agent_provider_protocol');

const CODEX_CLIENT_NAME = 'md2';
const CODEX_CLIENT_VERSION = '1';
const CODEX_MISSING_THREAD_ERROR_CODE = -32600;
const CODEX_APPROVAL_METHODS = new Map([
    ['item/commandExecution/requestApproval', 'commandExecution'],
    ['item/fileChange/requestApproval', 'fileChange'],
]);
const CODEX_COMMAND_APPROVAL_DECISIONS = ['accept', 'acceptForSession', 'decline', 'cancel'];
const CODEX_FILE_APPROVAL_DECISIONS = ['accept', 'acceptForSession', 'decline', 'cancel'];
const CLAUDE_QUESTION_TOOL = 'AskUserQuestion';
const CODEX_NON_ACTIVITY_ITEM_TYPES = new Set(['agentMessage', 'hookPrompt', 'userMessage']);

function requireMessage(content) {
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Streaming agent message is required');

    return content;
}

function claudeUserMessage(content) {
    return { message: { content, role: 'user' }, type: 'user' };
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

// The app-server already reports cache-free input tokens, unlike `codex exec`, so no subtraction here.
function codexUsage(params) {
    const usage = params.tokenUsage?.last;
    if (!usage) return null;

    return normalizeAgentTokenUsage({
        cachedInputTokens: usage.cachedInputTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningOutputTokens,
    });
}

function ensureActivityTextPart(activity, field, index) {
    if (!Number.isSafeInteger(index) || index < 0) return;
    while (activity[field].length <= index) activity[field].push('');
}

function isCodexMissingThreadError(error, providerConversationId) {
    if (!providerConversationId || error?.code !== CODEX_MISSING_THREAD_ERROR_CODE) return false;

    return error.message === `no rollout found for thread id ${providerConversationId}`;
}

function requireCodexApprovalId(value, field) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing Codex approval ${field}`);

    return value;
}

function sameDecision(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function availableApprovalDecisions(approval) {
    if (approval.kind === 'fileChange') return CODEX_FILE_APPROVAL_DECISIONS;
    if (Array.isArray(approval.availableDecisions)) return approval.availableDecisions;

    return CODEX_COMMAND_APPROVAL_DECISIONS;
}

class CodexStreamingAdapter {
    constructor(writeLine, onEvent, rootPath, providerConversationId, onRuntimeEvent) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
        this.onRuntimeEvent = onRuntimeEvent;
        this.providerConversationId = providerConversationId;
        this.rootPath = rootPath;
        this.activeTurnId = null;
        this.activeItems = new Map();
        this.assistantItemOrder = [];
        this.assistantStreams = new Map();
        this.completedItemIds = new Set();
        this.diagnosticSequence = 1;
        this.initialPrompt = null;
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.pendingApprovals = new Map();
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

    async answerApproval(requestId, decision) {
        const pendingApproval = this.pendingApprovals.get(requestId);
        if (!pendingApproval) throw new Error(`Unknown or stale Codex approval request id: ${requestId}`);
        if (pendingApproval.submitted) throw new Error(`Codex approval request was already submitted: ${requestId}`);
        const availableDecisions = availableApprovalDecisions(pendingApproval.approval);
        if (!availableDecisions.some((availableDecision) => sameDecision(availableDecision, decision))) {
            throw new Error(`Unsupported Codex approval decision for request ${requestId}`);
        }
        pendingApproval.submitted = true;
        try {
            await this.writeLine({ id: requestId, result: { decision } });
        } catch (error) {
            pendingApproval.submitted = false;
            throw error;
        }
        await this.onEvent({ requestId, type: 'approvalSubmitted' });
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
        if (CODEX_APPROVAL_METHODS.has(message.method)) {
            await this.handleApprovalRequest(message);
            return;
        }
        await this.handleNotification(message.method, message.params ?? {});
    }

    async handleApprovalRequest(message) {
        if (message.id === null || message.id === undefined) throw new Error('Missing Codex approval request id');
        if (this.pendingApprovals.has(message.id)) throw new Error(`Duplicate Codex approval request id: ${message.id}`);
        const kind = CODEX_APPROVAL_METHODS.get(message.method);
        const params = message.params;
        if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Missing Codex approval params');
        const threadId = requireCodexApprovalId(params.threadId, 'thread id');
        const turnId = requireCodexApprovalId(params.turnId, 'turn id');
        const itemId = requireCodexApprovalId(params.itemId, 'item id');
        if (threadId !== this.threadId) throw new Error(`Mismatched Codex approval thread id: ${threadId}`);
        if (turnId !== this.activeTurnId) throw new Error(`Mismatched Codex approval turn id: ${turnId}`);
        const trackedItem = this.activeItems.get(itemId);
        if (!trackedItem || trackedItem.itemType !== kind || this.completedItemIds.has(itemId)) {
            throw new Error(`Mismatched Codex approval item id: ${itemId}`);
        }
        const filePaths = kind === 'fileChange'
            ? trackedItem.item.changes
                ?.filter(({ path }) => typeof path === 'string' && path.length > 0)
                .map(({ path }) => path) ?? []
            : [];
        const approval = { ...structuredClone(params), filePaths, kind, requestId: message.id };
        this.pendingApprovals.set(message.id, { approval, submitted: false });
        await this.onEvent({ approval, type: 'approval' });
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
            if (purpose === 'rateLimitsRead') {
                await this.onRuntimeEvent({ kind: 'unavailable', observedAt: Date.now() });
                return;
            }
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
            await this.sendRequest('account/rateLimits/read', undefined, 'rateLimitsRead');
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
            return;
        }
        if (purpose === 'rateLimitsRead') {
            const hasSingleBucket = !!message.result?.rateLimits && typeof message.result.rateLimits === 'object';
            const hasBuckets = !!message.result?.rateLimitsByLimitId
                && typeof message.result.rateLimitsByLimitId === 'object'
                && Object.keys(message.result.rateLimitsByLimitId).length > 0;
            await this.onRuntimeEvent(hasSingleBucket || hasBuckets
                ? { kind: 'snapshot', observedAt: Date.now(), payload: message.result }
                : { kind: 'unavailable', observedAt: Date.now() });
        }
    }

    async handleNotification(method, params) {
        if (method === 'turn/started') {
            this.activeItems.clear();
            this.assistantItemOrder = [];
            this.assistantStreams.clear();
            this.completedItemIds.clear();
            this.activeTurnId = params.turn?.id ?? params.turnId;
            await this.onEvent({ turnId: this.activeTurnId, type: 'turnStarted' });
            return;
        }
        if (method === 'serverRequest/resolved') {
            await this.handleApprovalResolved(params);
            return;
        }
        if (method === 'item/started') {
            await this.handleItemStarted(method, params.item);
            return;
        }
        if (method === 'item/agentMessage/delta') {
            const trackedItem = await this.requireActiveItem(method, params.itemId, 'agentMessage');
            if (!trackedItem) return;
            trackedItem.assistantText = trackedItem.assistantText || params.delta.length > 0;
            trackedItem.bufferedAssistantText += params.delta;
            await this.flushAssistantStreams();
            return;
        }
        if (method === 'item/reasoning/summaryTextDelta') {
            await this.handleReasoningDelta(method, params, 'summary', params.summaryIndex);
            return;
        }
        if (method === 'item/reasoning/summaryPartAdded') {
            const trackedItem = await this.requireActiveItem(method, params.itemId, 'reasoning');
            if (!trackedItem) return;
            ensureActivityTextPart(trackedItem.activity, 'summary', params.summaryIndex);
            await this.emitActivity(trackedItem.activity);
            return;
        }
        if (method === 'item/reasoning/textDelta') {
            await this.handleReasoningDelta(method, params, 'details', params.contentIndex);
            return;
        }
        if (method === 'item/commandExecution/outputDelta') {
            const trackedItem = await this.requireActiveItem(method, params.itemId, 'commandExecution');
            if (!trackedItem) return;
            trackedItem.activity.output += params.delta;
            trackedItem.activity.content = trackedItem.activity.output;
            await this.emitActivity(trackedItem.activity);
            return;
        }
        if (method === 'item/plan/delta') {
            const trackedItem = await this.requireActiveItem(method, params.itemId, 'plan');
            if (!trackedItem) return;
            trackedItem.activity.content += params.delta;
            await this.emitActivity(trackedItem.activity);
            return;
        }
        if (method === 'thread/tokenUsage/updated') {
            this.turnUsage = codexUsage(params);
            return;
        }
        if (method === 'account/rateLimits/updated') {
            await this.onRuntimeEvent({ kind: 'update', observedAt: Date.now(), payload: params });
            return;
        }
        if (method === 'item/completed') {
            await this.handleItemCompleted(method, params.item);
            return;
        }
        const normalizedSystemActivity = systemActivity(method, params);
        if (normalizedSystemActivity) {
            await this.emitActivity(normalizedSystemActivity);
            return;
        }
        if (method === 'error') {
            const content = params.error?.message ?? 'Codex turn failed';
            await this.emitActivity({
                content,
                label: 'Turn failure',
                providerItemId: `system:${this.activeTurnId ?? 'unknown-turn'}:error`,
                status: 'failed',
                type: 'system',
            });
            await this.onEvent({ content, type: 'fatal' });
            return;
        }
        if (method === 'turn/completed') {
            const error = params.turn?.status === 'failed'
                ? params.turn.error?.message ?? 'Codex turn failed'
                : null;
            if (error) {
                await this.emitActivity({
                    content: error,
                    label: 'Turn failure',
                    providerItemId: `system:${params.turn?.id ?? this.activeTurnId ?? 'unknown-turn'}:turn/completed`,
                    status: 'failed',
                    type: 'system',
                });
            }
            const completedTurnId = params.turn?.id ?? this.activeTurnId;
            await this.resolveApprovalsForTurn(completedTurnId);
            this.activeTurnId = null;
            await this.onEvent({ error, type: 'turnCompleted', usage: this.turnUsage });
            this.turnUsage = null;
            return;
        }
        if (method?.startsWith('item/') && typeof params.itemId === 'string') {
            await this.emitDiagnostic(method, null, params.itemId);
        }
    }

    async handleApprovalResolved(params) {
        const pendingApproval = this.pendingApprovals.get(params.requestId);
        if (!pendingApproval) return;
        if (params.threadId !== pendingApproval.approval.threadId) {
            throw new Error(`Mismatched Codex approval resolution thread id: ${params.threadId}`);
        }
        this.pendingApprovals.delete(params.requestId);
        await this.onEvent({ requestId: params.requestId, type: 'approvalResolved' });
    }

    async resolveApprovalsForTurn(turnId) {
        for (const [requestId, pendingApproval] of this.pendingApprovals) {
            if (pendingApproval.approval.turnId !== turnId) continue;
            this.pendingApprovals.delete(requestId);
            await this.onEvent({ requestId, type: 'approvalResolved' });
        }
    }

    async handleItemStarted(method, item) {
        if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') {
            await this.emitDiagnostic(method, item?.type, item?.id);
            return;
        }
        if (this.activeItems.has(item.id) || this.completedItemIds.has(item.id)) {
            await this.emitDiagnostic(method, item.type, item.id);
            return;
        }
        const activity = normalizeCodexActivity(item, 'inProgress');
        const knownNonActivity = CODEX_NON_ACTIVITY_ITEM_TYPES.has(item.type);
        const trackedItem = {
            activity,
            assistantCompleted: false,
            assistantText: false,
            bufferedAssistantText: '',
            item: structuredClone(item),
            itemType: item.type,
        };
        this.activeItems.set(item.id, trackedItem);
        if (item.type === 'agentMessage') {
            this.assistantItemOrder.push(item.id);
            this.assistantStreams.set(item.id, trackedItem);
            await this.onEvent({ itemId: item.id, type: 'assistantStarted' });
        }
        if (activity) {
            await this.emitActivity(activity);
            return;
        }
        if (!knownNonActivity) await this.emitDiagnostic(method, item.type, item.id);
    }

    async handleItemCompleted(method, item) {
        if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') {
            await this.emitDiagnostic(method, item?.type, item?.id);
            return;
        }
        if (this.completedItemIds.has(item.id)) {
            await this.emitDiagnostic(method, item.type, item.id);
            return;
        }
        const trackedItem = this.activeItems.get(item.id);
        if (!trackedItem) await this.emitDiagnostic(method, item.type, item.id);
        if (trackedItem && trackedItem.itemType !== item.type) {
            await this.emitDiagnostic(method, item.type, item.id);
            return;
        }
        if (item.type === 'agentMessage' && trackedItem) {
            trackedItem.assistantCompleted = true;
            await this.flushAssistantStreams();
        }
        const changedPaths = codexChangedPaths(item, this.rootPath);
        if (changedPaths.length > 0) await this.onEvent({ paths: changedPaths, type: 'changedPaths' });
        const activity = normalizeCodexActivity(item, 'completed');
        if (activity) await this.emitActivity(activity);
        if (!activity && !CODEX_NON_ACTIVITY_ITEM_TYPES.has(item.type) && trackedItem) {
            await this.emitDiagnostic(method, item.type, item.id);
        }
        this.activeItems.delete(item.id);
        this.completedItemIds.add(item.id);
    }

    async requireActiveItem(method, itemId, expectedType) {
        const trackedItem = this.activeItems.get(itemId);
        if (!trackedItem || trackedItem.itemType !== expectedType || this.completedItemIds.has(itemId)) {
            await this.emitDiagnostic(method, expectedType, itemId);

            return null;
        }

        return trackedItem;
    }

    async handleReasoningDelta(method, params, field, index) {
        const trackedItem = await this.requireActiveItem(method, params.itemId, 'reasoning');
        if (!trackedItem || !Number.isSafeInteger(index) || index < 0) {
            if (trackedItem) await this.emitDiagnostic(method, 'reasoning', params.itemId);
            return;
        }
        ensureActivityTextPart(trackedItem.activity, field, index);
        trackedItem.activity[field][index] += params.delta;
        trackedItem.activity.content = trackedItem.activity.summary.length > 0
            ? trackedItem.activity.summary.join('\n\n')
            : trackedItem.activity.details.join('\n\n');
        await this.emitActivity(trackedItem.activity);
    }

    async flushAssistantStreams() {
        while (this.assistantItemOrder.length > 0) {
            const itemId = this.assistantItemOrder[0];
            const stream = this.assistantStreams.get(itemId);
            if (!stream) {
                this.assistantItemOrder.shift();
                continue;
            }
            if (stream.bufferedAssistantText.length > 0) {
                const content = stream.bufferedAssistantText;
                stream.bufferedAssistantText = '';
                await this.onEvent({ content, itemId, type: 'assistant' });
            }
            if (!stream.assistantCompleted) return;
            if (stream.assistantText) await this.onEvent({ content: '\n\n', itemId, type: 'assistant' });
            this.assistantStreams.delete(itemId);
            this.assistantItemOrder.shift();
        }
    }

    async emitActivity(activity) {
        await this.onEvent({ activity: structuredClone(activity), type: 'activity' });
    }

    async emitDiagnostic(method, itemType, itemId) {
        const activity = diagnosticActivity(method, itemType, itemId, this.diagnosticSequence);
        this.diagnosticSequence += 1;
        await this.emitActivity(activity);
    }
}

function createAgentStreamingAdapter(
    agent,
    writeLine,
    onEvent,
    rootPath,
    providerConversationId = null,
    onRuntimeEvent = async () => undefined,
) {
    if (agent === 'claude') return new ClaudeStreamingAdapter(writeLine, onEvent, rootPath, providerConversationId);
    if (agent === 'codex') {
        return new CodexStreamingAdapter(writeLine, onEvent, rootPath, providerConversationId, onRuntimeEvent);
    }

    throw new Error(`Agent profile does not support streaming: ${agent}`);
}

module.exports = { createAgentStreamingAdapter };
