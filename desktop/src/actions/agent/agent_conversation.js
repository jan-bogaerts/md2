const { sumAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');

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
    const event = {
        content: providerEvent.content,
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
    if (Array.isArray(providerEvent.details)) event.details = [...providerEvent.details];
    if (Number.isFinite(providerEvent.durationMs)) event.durationMs = providerEvent.durationMs;
    if (Number.isSafeInteger(providerEvent.exitCode)) event.exitCode = providerEvent.exitCode;
    if (typeof providerEvent.output === 'string') event.output = providerEvent.output;
    if (Array.isArray(providerEvent.summary)) event.summary = [...providerEvent.summary];
    if (typeof providerEvent.workingDirectory === 'string') event.workingDirectory = providerEvent.workingDirectory;

    return event;
}

function accumulateUsage(current, turn) {
    return sumAgentTokenUsage([current, turn]);
}

function createConversation(request, id, startedAt, reference) {
    if (request.conversation) {
        return {
            ...request.conversation,
            completedAt: null,
            entries: [...request.conversation.entries],
            path: reference,
            providerSessions: [...request.conversation.providerSessions],
            status: 'running',
        };
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
        title: typeof request.title === 'string' && request.title.length > 0 ? request.title : 'Agent run',
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
    updateProviderSession,
};
