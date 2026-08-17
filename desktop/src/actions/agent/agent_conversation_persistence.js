const {
    activityConversationReference,
    upsertActivityConversation,
} = require('../activity/activity_files');
const { persistConversationAndProjectUsage } = require('./project_agent_token_usage');

function requireActivityRequest(request) {
    if (!request?.activityProject) throw new Error('Missing agent activityProject');
    if (!request.activityOrigin) throw new Error('Missing agent activityOrigin');
    if (typeof request.projectFolder !== 'string') throw new Error('Missing agent projectFolder');

    return request;
}

function conversationReference(request, conversationId) {
    const activityRequest = requireActivityRequest(request);

    return activityConversationReference(activityRequest.projectFolder, activityRequest.activityOrigin, conversationId);
}

async function persistTerminalConversation(run) {
    requireActivityRequest(run.request);
    await persistConversationAndProjectUsage(run);
}

async function persistConversationCheckpoint(run) {
    const request = requireActivityRequest(run.request);
    await upsertActivityConversation(
        request.activityProject,
        request.projectFolder,
        request.activityOrigin,
        run.conversation,
    );
}

module.exports = {
    conversationReference,
    persistConversation: persistTerminalConversation,
    persistConversationCheckpoint,
    persistTerminalConversation,
};
