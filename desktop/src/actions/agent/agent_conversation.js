const { sumAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');
const {
    AGENT_CONVERSATION_USAGE_SCHEMA_VERSION,
    boundedAgentResult,
} = require('../../../../shared/agent_conversations.mjs');

function createMessageEntry(id, role, content, timestamp, agent, sequence) {
    return {
        ...(agent ? { agent } : {}),
        content,
        id,
        kind: 'message',
        role,
        ...(Number.isSafeInteger(sequence) ? { sequence } : {}),
        timestamp,
    };
}

function createEventEntry(id, type, content, timestamp, sequence) {
    return {
        content,
        id,
        kind: 'event',
        ...(Number.isSafeInteger(sequence) ? { sequence } : {}),
        timestamp,
        type,
    };
}

function createProviderEventEntry(providerEvent, id, timestamp, sequence) {
    const content = providerEvent.type === 'commandExecution' || providerEvent.type === 'tool.result'
        ? boundedAgentResult(providerEvent.content)
        : providerEvent.content;
    const event = {
        content,
        id,
        kind: 'event',
        label: providerEvent.label,
        providerItemId: providerEvent.providerItemId,
        sequence,
        status: providerEvent.status,
        timestamp,
        type: providerEvent.type,
    };
    if (typeof providerEvent.command === 'string') event.command = providerEvent.command;
    if (Number.isSafeInteger(providerEvent.deletions) && providerEvent.deletions >= 0) event.deletions = providerEvent.deletions;
    if (Array.isArray(providerEvent.details)) event.details = [...providerEvent.details];
    if (Number.isFinite(providerEvent.durationMs)) event.durationMs = providerEvent.durationMs;
    if (Number.isSafeInteger(providerEvent.exitCode)) event.exitCode = providerEvent.exitCode;
    if (Number.isSafeInteger(providerEvent.insertions) && providerEvent.insertions >= 0) event.insertions = providerEvent.insertions;
    if (Array.isArray(providerEvent.paths)) event.paths = [...providerEvent.paths];
    if (providerEvent.type !== 'commandExecution' && typeof providerEvent.output === 'string') {
        event.output = boundedAgentResult(providerEvent.output);
    }
    if (typeof providerEvent.parentItemId === 'string' && providerEvent.parentItemId.length > 0) {
        event.parentItemId = providerEvent.parentItemId;
    }
    if (Array.isArray(providerEvent.summary)) event.summary = [...providerEvent.summary];
    if (typeof providerEvent.workingDirectory === 'string') event.workingDirectory = providerEvent.workingDirectory;

    return event;
}

function accumulateUsage(current, turn) {
    return sumAgentTokenUsage([current, turn]);
}

/** Updates conversation status and accumulates only completed running periods. */
function transitionConversationStatus(conversation, status, transitionedAt) {
    if (!conversation.timer) {
        conversation.status = status;
        return;
    }

    const wasRunning = conversation.status === 'running';
    const isRunning = status === 'running';
    if (wasRunning === isRunning) {
        conversation.status = status;
        return;
    }
    const transitionedAtMs = Date.parse(transitionedAt);
    if (Number.isNaN(transitionedAtMs)) throw new Error('Invalid agent conversation timer transition timestamp');

    if (isRunning) {
        conversation.timer = { ...conversation.timer, runningStartedAt: transitionedAt };
    } else {
        const runningStartedAtMs = Date.parse(conversation.timer.runningStartedAt);
        if (Number.isNaN(runningStartedAtMs)) throw new Error('Missing agent conversation running start timestamp');
        if (transitionedAtMs < runningStartedAtMs) throw new Error('Agent conversation timer transition precedes running start');
        conversation.timer = {
            elapsedMs: conversation.timer.elapsedMs + transitionedAtMs - runningStartedAtMs,
            runningStartedAt: null,
        };
    }
    conversation.status = status;
}

function createConversation(request, id, startedAt, reference) {
    if (request.conversation) {
        const legacyUsage = request.conversation.usage && request.conversation.usageSchemaVersion === undefined
            ? {
                cachedInputTokens: 0,
                inputTokens: 0,
                legacyTotalTokens: request.conversation.usage.totalTokens,
                outputTokens: 0,
                reasoningTokens: 0,
                totalTokens: request.conversation.usage.totalTokens,
                ...(request.conversation.usage.costUsd !== undefined ? { costUsd: request.conversation.usage.costUsd } : {}),
            }
            : request.conversation.usage;
        const conversation = {
            ...request.conversation,
            completedAt: null,
            entries: [...request.conversation.entries],
            path: reference,
            providerSessions: [...request.conversation.providerSessions],
            ...(legacyUsage ? { usage: legacyUsage } : {}),
            usageSchemaVersion: AGENT_CONVERSATION_USAGE_SCHEMA_VERSION,
        };
        transitionConversationStatus(conversation, 'running', startedAt);

        return conversation;
    }

    return {
        actionId: request.actionId ?? null,
        cardInternalId: request.activityOrigin.kind === 'card' ? request.activityOrigin.cardInternalId : null,
        cardPath: request.cardPath ?? null,
        completedAt: null,
        entries: [],
        hasExplicitTitle: true,
        id,
        path: reference,
        providerSessions: [],
        startedAt,
        status: 'running',
        timer: { elapsedMs: 0, runningStartedAt: startedAt },
        title: typeof request.title === 'string' && request.title.length > 0 ? request.title : 'Agent run',
        usageSchemaVersion: AGENT_CONVERSATION_USAGE_SCHEMA_VERSION,
        viewed: true,
    };
}

/** Snapshots the mutable conversation collections while reusing immutable entries. */
function snapshotConversation(conversation) {
    return {
        ...conversation,
        entries: [...conversation.entries],
        providerSessions: [...conversation.providerSessions],
    };
}

function updateProviderSession(run, synchronizedThroughMessageId, completedAt) {
    const conversationId = run.providerConversationId ?? run.request.providerConversationId;
    if (!conversationId) return;

    const sessions = run.conversation.providerSessions;
    const current = sessions.find(({ agent }) => agent === run.agent);
    const nextSession = {
        agent: run.agent,
        conversationId,
        createdAt: current?.createdAt ?? completedAt,
        lastUsedAt: completedAt,
        synchronizedThroughMessageId,
    };
    run.conversation.providerSessions = current
        ? sessions.map((session) => (session.agent === run.agent ? nextSession : session))
        : [...sessions, nextSession];
}

module.exports = {
    accumulateUsage,
    createProviderEventEntry,
    createConversation,
    createEventEntry,
    createMessageEntry,
    snapshotConversation,
    transitionConversationStatus,
    updateProviderSession,
};
