const {
    activityConversationReference,
    loadActivityValue,
    queueActivityUpdate,
    resolveActivityPath,
    upsertConversation,
    upsertActivityConversation,
    writeActivityFile,
} = require('../activity/activity_files');
const { appendCardActivityReference } = require('../activity/card_activity_reference');
const { assertGitRoot, requireRootPath } = require('../../git/git_commands');
const { uncommittedProjectWrites } = require('../../project/uncommitted_project_writes');
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

async function persistInitialCardConversation(run, dependencyOverrides = {}) {
    const request = requireActivityRequest(run.request);
    if (request.activityOrigin.kind !== 'card') throw new Error('Initial card conversation requires card activity origin');
    if (typeof request.cardPath !== 'string' || request.cardPath.length === 0) throw new Error('Missing agent cardPath');
    const rootPath = requireRootPath(request.activityProject);
    const assertRepositoryRoot = dependencyOverrides.assertGitRoot ?? assertGitRoot;
    await assertRepositoryRoot(rootPath);
    const { absolutePath, relativePath } = resolveActivityPath(rootPath, request.projectFolder, request.activityOrigin);
    const appendReference = dependencyOverrides.appendCardActivityReference ?? appendCardActivityReference;
    const deferProjectWriteQueue = request.deferProjectWriteQueue === true;
    const projectWrites = dependencyOverrides.uncommittedProjectWrites ?? uncommittedProjectWrites;

    return queueActivityUpdate(rootPath, absolutePath, async () => {
        const activity = upsertConversation(
            await loadActivityValue(absolutePath, request.activityOrigin),
            run.conversation,
        );
        await writeActivityFile(absolutePath, activity);
        await appendReference(
            request.activityProject,
            request.cardPath,
            request.activityOrigin.cardInternalId,
            relativePath,
        );
        if (!deferProjectWriteQueue) projectWrites.mark(rootPath, [request.cardPath]);

        return { activity, relativePath };
    }, { markProjectWrite: !deferProjectWriteQueue });
}

async function persistConversationCheckpoint(run, dependencyOverrides = {}) {
    const request = requireActivityRequest(run.request);
    const persistInitial = dependencyOverrides.persistInitialCardConversation ?? persistInitialCardConversation;
    const upsertConversationCheckpoint = dependencyOverrides.upsertActivityConversation ?? upsertActivityConversation;
    if (request.activityOrigin.kind === 'card' && !request.conversation) {
        await persistInitial(run);
        return;
    }
    await upsertConversationCheckpoint(
        request.activityProject,
        request.projectFolder,
        request.activityOrigin,
        run.conversation,
        { markProjectWrite: request.deferProjectWriteQueue !== true },
    );
}

module.exports = {
    conversationReference,
    persistConversation: persistTerminalConversation,
    persistConversationCheckpoint,
    persistInitialCardConversation,
    persistTerminalConversation,
};
