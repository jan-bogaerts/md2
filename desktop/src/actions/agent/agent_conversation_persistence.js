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
const { assertGitRoot, commitTrackedPaths, requireRootPath } = require('../../git/git_commands');
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
    const commitPaths = dependencyOverrides.commitTrackedPaths ?? commitTrackedPaths;

    return queueActivityUpdate(absolutePath, async () => {
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
        await commitPaths(rootPath, [relativePath, request.cardPath], 'Start card agent activity');

        return { activity, relativePath };
    });
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
    );
}

module.exports = {
    conversationReference,
    persistConversation: persistTerminalConversation,
    persistConversationCheckpoint,
    persistInitialCardConversation,
    persistTerminalConversation,
};
