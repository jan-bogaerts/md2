const {
    activityConversationReference,
    commitActivityFile,
    upsertActivityConversation,
} = require('./activity_files');

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
    const request = requireActivityRequest(run.request);
    const { relativePath } = await upsertActivityConversation(
        request.activityProject,
        request.projectFolder,
        request.activityOrigin,
        run.conversation,
    );
    if (!request.deferActivityCommit) {
        await commitActivityFile(
            request.activityProject,
            relativePath,
            `Update ${request.activityOrigin.kind} activity`,
        );
    }
}

module.exports = { conversationReference, persistTerminalConversation };
