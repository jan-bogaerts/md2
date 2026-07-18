const { sumAgentTokenUsage } = require('../../../shared/agent_usage_math.mjs');

function createMessage(id, role, content, timestamp, agent) {
    return { ...(agent ? { agent } : {}), content, id, role, timestamp };
}

function createEvent(id, type, content, timestamp) {
    return { content, id, timestamp, type };
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
    createConversation,
    createEvent,
    createMessage,
    updateProviderSession,
};
