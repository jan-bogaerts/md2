const { sumAgentTokenUsage, validateAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');
const { appendBoundedAgentResult } = require('../../../../shared/agent_conversations.mjs');
const { ClaudeStreamingAdapter } = require('./agent_claude_streaming_adapter');
const { diagnosticEvent, normalizeCodexEvent, systemEvent } = require('./agent_codex_event');
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
const CODEX_NON_EVENT_ITEM_TYPES = new Set(['agentMessage', 'hookPrompt', 'userMessage']);

function requireMessage(content) {
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Streaming agent message is required');

    return content;
}

function codexInput(content) {
    return [{ text: requireMessage(content), type: 'text' }];
}

/** Reads one Codex breakdown, rejecting malformed counters and totals before they feed turn arithmetic. */
function codexUsageCounters(breakdown) {
    if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) return null;
    const cachedInputTokens = breakdown.cachedInputTokens ?? 0;
    const reasoningTokens = breakdown.reasoningOutputTokens ?? 0;
    validateAgentTokenUsage({
        cachedInputTokens,
        inputTokens: breakdown.inputTokens - cachedInputTokens,
        outputTokens: breakdown.outputTokens - reasoningTokens,
        reasoningTokens,
    }, breakdown.totalTokens);

    return {
        cachedInputTokens,
        inputTokens: breakdown.inputTokens,
        outputTokens: breakdown.outputTokens,
        reasoningTokens,
    };
}

/** Growth of cumulative counters; clamped so an out-of-order or reset reading cannot report negative usage. */
function codexUsageGrowth(counters, baseline) {
    return {
        cachedInputTokens: Math.max(counters.cachedInputTokens - baseline.cachedInputTokens, 0),
        inputTokens: Math.max(counters.inputTokens - baseline.inputTokens, 0),
        outputTokens: Math.max(counters.outputTokens - baseline.outputTokens, 0),
        reasoningTokens: Math.max(counters.reasoningTokens - baseline.reasoningTokens, 0),
    };
}

/**
 * Codex counts tokens per model request, but one turn spans many of them: `tokenUsage.last` holds
 * only the newest request while `tokenUsage.total` accumulates the whole thread. Turn usage is the
 * growth of `total` since the turn began, which matches the whole-turn totals Claude reports and
 * makes both providers comparable. `total - last` reconstructs that baseline from the turn's first
 * reading. Codex builds without `total` fall back to the newest request alone.
 */
function codexTurnCounters(params) {
    const last = codexUsageCounters(params.tokenUsage?.last);
    const totals = codexUsageCounters(params.tokenUsage?.total) ?? last;
    if (!last || !totals) return null;

    return { baseline: codexUsageGrowth(totals, last), totals };
}

/** Splits Codex counters into disjoint buckets: cached input sits inside input, reasoning inside output. */
function codexUsage(counters) {
    return validateAgentTokenUsage({
        cachedInputTokens: counters.cachedInputTokens,
        inputTokens: counters.inputTokens - counters.cachedInputTokens,
        outputTokens: counters.outputTokens - counters.reasoningTokens,
        reasoningTokens: counters.reasoningTokens,
    });
}

function codexContextWindowUsage(params) {
    const usedTokens = params.tokenUsage?.last?.totalTokens;
    const capacityTokens = params.tokenUsage?.modelContextWindow;
    if (!Number.isSafeInteger(usedTokens) || usedTokens < 0) return null;
    if (!Number.isSafeInteger(capacityTokens) || capacityTokens <= 0) return null;

    return { capacityTokens, usedTokens };
}

function isCodexContextOnlyTokenUsage(params) {
    const usage = params.tokenUsage?.last;
    if (!usage || usage.totalTokens <= 0) return false;

    return usage.cachedInputTokens === 0
        && usage.inputTokens === 0
        && usage.outputTokens === 0
        && (usage.reasoningOutputTokens ?? 0) === 0;
}

function eventTextParts(event, field, index) {
    const parts = [...event[field]];
    while (parts.length <= index) parts.push('');

    return parts;
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

const DEFAULT_CODEX_SUB_AGENT_LABEL = 'Sub agent';

function createCodexThreadState() {
    return {
        activeItems: new Map(),
        activeTurnId: null,
        assistantItemOrder: [],
        assistantStreams: new Map(),
        completedItemIds: new Set(),
        turnContextWindowUsage: undefined,
        turnUsage: null,
        turnUsageBaseline: null,
    };
}

/** Marks an event as owned by the collaboration call whose child thread produced it. */
function codexOwnedEvent(event, parentItemId) {
    return parentItemId ? { ...event, parentItemId } : event;
}

/** Namespaces an id this adapter invents, so a child thread's row cannot collide with a root one. */
function codexGeneratedEvent(context, event) {
    if (!context.isChild) return event;

    return { ...event, providerItemId: `${context.threadId}:${event.providerItemId}` };
}

function codexReceiverThreadIds(item) {
    if (!Array.isArray(item?.receiverThreadIds)) return [];

    return item.receiverThreadIds.filter((threadId) => typeof threadId === 'string' && threadId.length > 0);
}

class CodexStreamingAdapter {
    constructor(writeLine, onEvent, rootPath, providerConversationId, onRuntimeEvent) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
        this.onRuntimeEvent = onRuntimeEvent;
        this.providerConversationId = providerConversationId;
        this.rootPath = rootPath;
        // Child thread id to the collaboration item that started it. Entries live for the run, because a
        // child thread keeps reporting after that collaboration item has completed.
        this.childThreads = new Map();
        this.diagnosticSequence = 1;
        this.initialPrompt = null;
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.pendingApprovals = new Map();
        this.pendingQuestions = new Map();
        this.subAgentLabels = new Map();
        // One turn record per thread, so a child turn cannot clear the root turn's items or end it early.
        this.threadStates = new Map();
        this.threadId = null;
    }

    threadState(threadId) {
        const key = threadId ?? 'root';
        const current = this.threadStates.get(key);
        if (current) return current;
        const created = createCodexThreadState();
        this.threadStates.set(key, created);

        return created;
    }

    rootState() {
        return this.threadState(this.threadId);
    }

    subAgentLabel(itemId) {
        return this.subAgentLabels.get(itemId) ?? DEFAULT_CODEX_SUB_AGENT_LABEL;
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
        const rootTurnId = this.rootState().activeTurnId;
        if (rootTurnId) {
            await this.sendRequest('turn/steer', {
                expectedTurnId: rootTurnId,
                input,
                threadId: this.threadId,
            });
            return;
        }
        await this.sendRequest('turn/start', { input, threadId: this.threadId });
    }

    async answerQuestion(requestId, answers) {
        const pendingQuestion = this.pendingQuestions.get(requestId);
        if (!pendingQuestion) throw new Error(`Unknown or stale Codex question request id: ${requestId}`);
        if (pendingQuestion.submitted) throw new Error(`Codex question request was already submitted: ${requestId}`);
        const normalizedAnswers = Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => [
            questionId,
            { answers: Array.isArray(answer) ? answer : [answer] },
        ]));
        pendingQuestion.submitted = true;
        try {
            await this.writeLine({ id: requestId, result: { answers: normalizedAnswers } });
        } catch (error) {
            pendingQuestion.submitted = false;
            throw error;
        }
        this.pendingQuestions.delete(requestId);
    }

    async dismissQuestion(requestId) {
        const pendingQuestion = this.pendingQuestions.get(requestId);
        if (!pendingQuestion) throw new Error(`Unknown or stale Codex question request id: ${requestId}`);
        if (pendingQuestion.submitted) throw new Error(`Codex question request was already submitted: ${requestId}`);
        pendingQuestion.submitted = true;
        try {
            await this.writeLine({ id: requestId, result: { answers: {} } });
        } catch (error) {
            pendingQuestion.submitted = false;
            throw error;
        }
        this.pendingQuestions.delete(requestId);
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
            if (message.id === null || message.id === undefined) throw new Error('Missing Codex question request id');
            if (this.pendingQuestions.has(message.id)) throw new Error(`Duplicate Codex question request id: ${message.id}`);
            this.pendingQuestions.set(message.id, { submitted: false });
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
        const context = this.resolveNotificationContext({ threadId });
        if (!context) {
            await this.writeLine({ id: message.id, result: { decision: 'cancel' } });
            return;
        }
        const { parentItemId, state } = context;
        if (turnId !== state.activeTurnId) {
            if (context.isChild) {
                await this.rejectChildApprovalRequest(message, context, kind, itemId);
                return;
            }
            throw new Error(`Mismatched Codex approval turn id: ${turnId}`);
        }
        const trackedItem = state.activeItems.get(itemId);
        if (!trackedItem || trackedItem.itemType !== kind || state.completedItemIds.has(itemId)) {
            if (context.isChild) {
                await this.rejectChildApprovalRequest(message, context, kind, itemId);
                return;
            }
            throw new Error(`Mismatched Codex approval item id: ${itemId}`);
        }
        const filePaths = kind === 'fileChange'
            ? trackedItem.item.changes
                ?.filter(({ path }) => typeof path === 'string' && path.length > 0)
                .map(({ path }) => path) ?? []
            : [];
        const approval = {
            ...params,
            filePaths,
            kind,
            ...(parentItemId ? { parentItemId, subAgentLabel: this.subAgentLabel(parentItemId) } : {}),
            provider: 'codex',
            requestId: message.id,
        };
        this.pendingApprovals.set(message.id, { approval, submitted: false });
        await this.onEvent({ approval, type: 'approval' });
    }

    async rejectChildApprovalRequest(message, context, kind, itemId) {
        await this.emitDiagnostic(context, message.method, kind, itemId);
        await this.writeLine({ id: message.id, result: { decision: 'cancel' } });
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

    /**
     * Resolves which thread a notification belongs to. The root thread and any thread a tracked
     * collaboration call started are accepted; every other thread is ignored, so unrelated traffic
     * cannot inject transcript rows.
     */
    resolveNotificationContext(params) {
        const notificationThreadId = typeof params.threadId === 'string' ? params.threadId : null;
        if (!this.threadId || !notificationThreadId || notificationThreadId === this.threadId) {
            const threadId = notificationThreadId ?? this.threadId;

            return { isChild: false, parentItemId: null, state: this.threadState(threadId), threadId };
        }
        const parentItemId = this.childThreads.get(notificationThreadId);
        if (!parentItemId) return null;

        return {
            isChild: true,
            parentItemId,
            state: this.threadState(notificationThreadId),
            threadId: notificationThreadId,
        };
    }

    /** A new root turn restarts usage accounting for every thread, so child growth is never counted twice. */
    resetRootTurnState() {
        const rootKey = this.threadId ?? 'root';
        for (const key of [...this.threadStates.keys()]) {
            if (key !== rootKey) this.threadStates.delete(key);
        }
        const rootState = this.threadState(this.threadId);
        rootState.turnContextWindowUsage = undefined;
        rootState.turnUsage = null;
        rootState.turnUsageBaseline = null;
    }

    async handleNotification(method, params) {
        const context = this.resolveNotificationContext(params);
        if (!context) return;
        const { isChild, state } = context;

        if (method === 'turn/started') {
            const turnId = params.turn?.id ?? params.turnId;
            if (!isChild) this.resetRootTurnState();
            state.activeItems.clear();
            state.assistantItemOrder = [];
            state.assistantStreams.clear();
            state.completedItemIds.clear();
            state.activeTurnId = turnId;
            if (isChild) return;
            await this.onEvent({ turnId, type: 'turnStarted' });
            return;
        }
        if (method === 'serverRequest/resolved') {
            await this.handleApprovalResolved(context, params);
            return;
        }
        if (method === 'item/started') {
            await this.handleItemStarted(context, method, params.item);
            return;
        }
        if (method === 'item/agentMessage/delta') {
            const trackedItem = await this.requireActiveItem(context, method, params.itemId, 'agentMessage');
            if (!trackedItem) return;
            if (isChild) {
                trackedItem.childText += params.delta;
                trackedItem.event = { ...trackedItem.event, content: trackedItem.childText };
                await this.emitEvent(context, trackedItem.event);
                return;
            }
            trackedItem.assistantText = trackedItem.assistantText || params.delta.length > 0;
            trackedItem.bufferedAssistantText += params.delta;
            await this.flushAssistantStreams(state);
            return;
        }
        if (method === 'item/reasoning/summaryTextDelta') {
            await this.handleReasoningDelta(context, method, params, 'summary', params.summaryIndex);
            return;
        }
        if (method === 'item/reasoning/summaryPartAdded') {
            const trackedItem = await this.requireActiveItem(context, method, params.itemId, 'reasoning');
            if (!trackedItem) return;
            trackedItem.event = {
                ...trackedItem.event,
                summary: eventTextParts(trackedItem.event, 'summary', params.summaryIndex),
            };
            await this.emitEvent(context, trackedItem.event);
            return;
        }
        if (method === 'item/reasoning/textDelta') {
            await this.handleReasoningDelta(context, method, params, 'details', params.contentIndex);
            return;
        }
        if (method === 'item/commandExecution/outputDelta') {
            const trackedItem = await this.requireActiveItem(context, method, params.itemId, 'commandExecution');
            if (!trackedItem) return;
            const bounded = appendBoundedAgentResult(trackedItem.resultState, params.delta);
            trackedItem.resultState = bounded.state;
            trackedItem.event = { ...trackedItem.event, content: bounded.value };
            await this.emitEvent(context, trackedItem.event);
            return;
        }
        if (method === 'item/plan/delta') {
            const trackedItem = await this.requireActiveItem(context, method, params.itemId, 'plan');
            if (!trackedItem) return;
            trackedItem.event = { ...trackedItem.event, content: `${trackedItem.event.content}${params.delta}` };
            await this.emitEvent(context, trackedItem.event);
            return;
        }
        if (method === 'thread/tokenUsage/updated') {
            await this.handleTokenUsage(context, params);
            return;
        }
        if (method === 'account/rateLimits/updated') {
            await this.onRuntimeEvent({ kind: 'update', observedAt: Date.now(), payload: params });
            return;
        }
        if (method === 'item/completed') {
            await this.handleItemCompleted(context, method, params.item);
            return;
        }
        const normalizedSystemEvent = systemEvent(method, params);
        if (normalizedSystemEvent) {
            await this.emitEvent(context, codexGeneratedEvent(context, normalizedSystemEvent));
            return;
        }
        if (method === 'error') {
            const content = params.error?.message ?? 'Codex turn failed';
            await this.emitEvent(context, codexGeneratedEvent(context, {
                content,
                label: 'Turn failure',
                providerItemId: `system:${state.activeTurnId ?? 'unknown-turn'}:error`,
                status: 'failed',
                type: 'system',
            }));
            // A child thread's failure is reported inside its group; failing the run would kill the process tree.
            if (isChild) return;
            await this.onEvent({ content, type: 'fatal' });
            return;
        }
        if (method === 'turn/completed') {
            await this.handleTurnCompleted(context, params);
            return;
        }
        if (method?.startsWith('item/') && typeof params.itemId === 'string') {
            await this.emitDiagnostic(context, method, null, params.itemId);
        }
    }

    /**
     * Codex reports cumulative totals per thread, so every thread keeps its own baseline and the turn's
     * usage is the sum of each thread's growth. The context window describes a single thread's context,
     * so only the root thread's figure is reported.
     */
    async handleTokenUsage(context, params) {
        const { isChild, state } = context;
        if (isCodexContextOnlyTokenUsage(params)) {
            if (!isChild) state.turnContextWindowUsage = codexContextWindowUsage(params);
            return;
        }
        const counters = codexTurnCounters(params);
        if (!counters) return;
        state.turnUsageBaseline ??= counters.baseline;
        state.turnUsage = codexUsage(codexUsageGrowth(counters.totals, state.turnUsageBaseline));
        if (!isChild) state.turnContextWindowUsage = codexContextWindowUsage(params);
        await this.onEvent({
            contextWindowUsage: this.rootState().turnContextWindowUsage,
            type: 'usage',
            usage: this.turnUsageTotal(),
        });
    }

    turnUsageTotal() {
        const usages = [...this.threadStates.values()]
            .map(({ turnUsage }) => turnUsage)
            .filter((turnUsage) => turnUsage !== null && turnUsage !== undefined);
        if (usages.length === 0) return null;

        return sumAgentTokenUsage(usages);
    }

    /** Only the root thread's completion ends the turn; a child completion closes just that child's record. */
    async handleTurnCompleted(context, params) {
        const { isChild, state } = context;
        const error = params.turn?.status === 'failed'
            ? params.turn.error?.message ?? 'Codex turn failed'
            : null;
        if (error) {
            await this.emitEvent(context, codexGeneratedEvent(context, {
                content: error,
                label: 'Turn failure',
                providerItemId: `system:${params.turn?.id ?? state.activeTurnId ?? 'unknown-turn'}:turn/completed`,
                status: 'failed',
                type: 'system',
            }));
        }
        const completedTurnId = params.turn?.id ?? state.activeTurnId;
        await this.resolveApprovalsForTurn(context.threadId, completedTurnId);
        state.activeTurnId = null;
        if (isChild) return;
        this.pendingQuestions.clear();
        const contextWindowUsage = state.turnContextWindowUsage;
        const usage = this.turnUsageTotal();
        await this.onEvent({
            ...(contextWindowUsage !== undefined ? { contextWindowUsage } : {}),
            error,
            type: 'turnCompleted',
            usage,
        });
        this.resetRootTurnState();
    }

    async handleApprovalResolved(context, params) {
        const pendingApproval = this.pendingApprovals.get(params.requestId);
        if (!pendingApproval) return;
        if (params.threadId !== pendingApproval.approval.threadId) {
            await this.emitDiagnostic(context, 'serverRequest/resolved', pendingApproval.approval.kind, String(params.requestId));
            return;
        }
        this.pendingApprovals.delete(params.requestId);
        await this.onEvent({ requestId: params.requestId, type: 'approvalResolved' });
    }

    async resolveApprovalsForTurn(threadId, turnId) {
        for (const [requestId, pendingApproval] of this.pendingApprovals) {
            if (pendingApproval.approval.threadId !== threadId) continue;
            if (pendingApproval.approval.turnId !== turnId) continue;
            this.pendingApprovals.delete(requestId);
            await this.onEvent({ requestId, type: 'approvalResolved' });
        }
    }

    /**
     * Remembers the threads a collaboration call started so their notifications are accepted and tagged
     * with that call. A collaboration call made inside a child thread registers against its own item id,
     * which makes ownership recursive.
     */
    registerChildThreads(item) {
        if (item?.type !== 'collabAgentToolCall' || typeof item.id !== 'string') return;
        const label = typeof item.tool === 'string' && item.tool.length > 0 ? item.tool : DEFAULT_CODEX_SUB_AGENT_LABEL;
        this.subAgentLabels.set(item.id, label);
        for (const threadId of codexReceiverThreadIds(item)) {
            if (threadId !== this.threadId) this.childThreads.set(threadId, item.id);
        }
    }

    /** Child assistant text is a labelled event, never main-agent message content, so resume stays clean. */
    subAgentMessageEvent(context, providerItemId, content, status) {
        return {
            content,
            label: this.subAgentLabel(context.parentItemId),
            providerItemId,
            status,
            type: 'agentMessage',
        };
    }

    async handleItemStarted(context, method, item) {
        const { isChild, state } = context;
        if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') {
            await this.emitDiagnostic(context, method, item?.type, item?.id);
            return;
        }
        if (state.activeItems.has(item.id) || state.completedItemIds.has(item.id)) {
            await this.emitDiagnostic(context, method, item.type, item.id);
            return;
        }
        this.registerChildThreads(item);
        const isSubAgentMessage = isChild && item.type === 'agentMessage';
        const startedText = typeof item.text === 'string' ? item.text : '';
        const event = isSubAgentMessage
            ? this.subAgentMessageEvent(context, item.id, startedText, 'inProgress')
            : normalizeCodexEvent(item, 'inProgress');
        const initialResult = item.type === 'commandExecution'
            ? appendBoundedAgentResult(null, event?.content ?? '')
            : null;
        const knownNonEvent = CODEX_NON_EVENT_ITEM_TYPES.has(item.type);
        const trackedItem = {
            event,
            assistantCompleted: false,
            assistantText: false,
            bufferedAssistantText: '',
            childText: isSubAgentMessage ? startedText : '',
            item,
            itemType: item.type,
            resultState: initialResult?.state ?? null,
        };
        state.activeItems.set(item.id, trackedItem);
        if (item.type === 'agentMessage' && !isChild) {
            state.assistantItemOrder.push(item.id);
            state.assistantStreams.set(item.id, trackedItem);
            await this.onEvent({ itemId: item.id, type: 'assistantStarted' });
        }
        if (event) {
            await this.emitEvent(context, event);
            return;
        }
        if (!knownNonEvent) await this.emitDiagnostic(context, method, item.type, item.id);
    }

    async handleItemCompleted(context, method, item) {
        const { isChild, state } = context;
        if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') {
            await this.emitDiagnostic(context, method, item?.type, item?.id);
            return;
        }
        if (state.completedItemIds.has(item.id)) {
            await this.emitDiagnostic(context, method, item.type, item.id);
            return;
        }
        const trackedItem = state.activeItems.get(item.id);
        if (!trackedItem) await this.emitDiagnostic(context, method, item.type, item.id);
        if (trackedItem && trackedItem.itemType !== item.type) {
            await this.emitDiagnostic(context, method, item.type, item.id);
            return;
        }
        this.registerChildThreads(item);
        if (item.type === 'agentMessage' && trackedItem && !isChild) {
            trackedItem.assistantCompleted = true;
            await this.flushAssistantStreams(state);
        }
        const event = isChild && item.type === 'agentMessage'
            ? this.subAgentMessageEvent(
                context,
                item.id,
                typeof item.text === 'string' ? item.text : trackedItem?.childText ?? '',
                'completed',
            )
            : normalizeCodexEvent(item, 'completed', this.rootPath);
        if (event) await this.emitEvent(context, event);
        if (!event && !CODEX_NON_EVENT_ITEM_TYPES.has(item.type) && trackedItem) {
            await this.emitDiagnostic(context, method, item.type, item.id);
        }
        state.activeItems.delete(item.id);
        state.completedItemIds.add(item.id);
    }

    async requireActiveItem(context, method, itemId, expectedType) {
        const { state } = context;
        const trackedItem = state.activeItems.get(itemId);
        if (!trackedItem || trackedItem.itemType !== expectedType || state.completedItemIds.has(itemId)) {
            await this.emitDiagnostic(context, method, expectedType, itemId);

            return null;
        }

        return trackedItem;
    }

    async handleReasoningDelta(context, method, params, field, index) {
        const trackedItem = await this.requireActiveItem(context, method, params.itemId, 'reasoning');
        if (!trackedItem || !Number.isSafeInteger(index) || index < 0) {
            if (trackedItem) await this.emitDiagnostic(context, method, 'reasoning', params.itemId);
            return;
        }
        const parts = eventTextParts(trackedItem.event, field, index);
        parts[index] += params.delta;
        const event = { ...trackedItem.event, [field]: parts };
        trackedItem.event = {
            ...event,
            content: event.summary.length > 0 ? event.summary.join('\n\n') : event.details.join('\n\n'),
        };
        await this.emitEvent(context, trackedItem.event);
    }

    async flushAssistantStreams(state) {
        while (state.assistantItemOrder.length > 0) {
            const itemId = state.assistantItemOrder[0];
            const stream = state.assistantStreams.get(itemId);
            if (!stream) {
                state.assistantItemOrder.shift();
                continue;
            }
            if (stream.bufferedAssistantText.length > 0) {
                const content = stream.bufferedAssistantText;
                stream.bufferedAssistantText = '';
                await this.onEvent({ content, itemId, type: 'assistant' });
            }
            if (!stream.assistantCompleted) return;
            if (stream.assistantText) await this.onEvent({ content: '\n\n', itemId, type: 'assistant' });
            state.assistantStreams.delete(itemId);
            state.assistantItemOrder.shift();
        }
    }

    async emitEvent(context, event) {
        await this.onEvent({ event: codexOwnedEvent(event, context.parentItemId), type: 'event' });
    }

    async emitDiagnostic(context, method, itemType, itemId) {
        const event = diagnosticEvent(method, itemType, itemId, this.diagnosticSequence);
        this.diagnosticSequence += 1;
        await this.emitEvent(context, codexGeneratedEvent(context, event));
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
