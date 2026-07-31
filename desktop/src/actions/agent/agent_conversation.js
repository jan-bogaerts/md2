const { sumAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');

function createMessage(id, role, content, timestamp, agent, sequence) {
    return {
        ...(agent ? { agent } : {}),
        content,
        id,
        role,
        ...(Number.isSafeInteger(sequence) ? { sequence } : {}),
        timestamp,
    };
}

function createEvent(id, type, content, timestamp, sequence) {
    return {
        content,
        id,
        ...(Number.isSafeInteger(sequence) ? { sequence } : {}),
        timestamp,
        type,
    };
}

function createActivityEvent(activity, id, timestamp, sequence) {
    const event = {
        content: activity.content,
        id,
        label: activity.label,
        providerItemId: activity.providerItemId,
        sequence,
        status: activity.status,
        timestamp,
        type: activity.type,
    };
    if (typeof activity.command === 'string') event.command = activity.command;
    if (Array.isArray(activity.details)) event.details = [...activity.details];
    if (Number.isFinite(activity.durationMs)) event.durationMs = activity.durationMs;
    if (Number.isSafeInteger(activity.exitCode)) event.exitCode = activity.exitCode;
    if (typeof activity.output === 'string') event.output = activity.output;
    if (Array.isArray(activity.summary)) event.summary = [...activity.summary];
    if (typeof activity.workingDirectory === 'string') event.workingDirectory = activity.workingDirectory;

    return event;
}

function accumulateUsage(current, turn) {
    return sumAgentTokenUsage([current, turn]);
}

function createConversation(request, id, startedAt) {
    if (request.conversation) {
        const persistedEntries = Object.entries(request.conversation).filter(([fieldName]) => fieldName !== 'path');
        const persistedConversation = Object.fromEntries(persistedEntries);

        return {
            ...persistedConversation,
            completedAt: null,
            events: [...request.conversation.events],
            messages: [...request.conversation.messages],
            providerSessions: [...(request.conversation.providerSessions ?? [])],
            status: 'running',
        };
    }

    return {
        actionId: request.actionId ?? null,
        cardInternalId: request.activityOrigin.kind === 'card' ? request.activityOrigin.cardInternalId : null,
        ...(request.cardPath ? { cardPath: request.cardPath } : {}),
        completedAt: null,
        events: [],
        hasExplicitTitle: true,
        id,
        messages: [],
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
    createActivityEvent,
    createConversation,
    createEvent,
    createMessage,
    updateProviderSession,
};
