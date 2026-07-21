const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { createActivityFile, findActivityConversation, parseActivityFile } = require('../../../shared/card_activity.mjs');
const {
    activityFilePath,
    conversationActivityReference,
    parseConversationActivityReference,
} = require('../../../shared/activity_paths.mjs');
const {
    assertGitRoot,
    commitExists,
    commitTrackedPaths,
    ensureInsideRoot,
    isCommitAncestor,
    pathExists,
    requireRootPath,
} = require('../git/git_commands');

const activityWriteQueues = new Map();
const VISIBILITY_CHECK_CONCURRENCY = 8;

function requireProjectFolder(value) {
    if (typeof value !== 'string') throw new Error('Missing activity projectFolder');

    return value;
}

function requireOrigin(value) {
    return createActivityFile(value).origin;
}

function resolveActivityPath(rootPath, projectFolder, origin) {
    const relativePath = activityFilePath(requireProjectFolder(projectFolder), requireOrigin(origin));

    return {
        absolutePath: ensureInsideRoot(rootPath, path.join(rootPath, relativePath)),
        relativePath,
    };
}

async function readActivityFile(filePath, origin) {
    if (!await pathExists(filePath)) return createActivityFile(origin);

    return parseActivityFile(await fs.promises.readFile(filePath, 'utf8'), origin);
}

async function writeActivityFile(filePath, activity) {
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(activity, null, 2)}\n`);
    await fs.promises.rename(temporaryPath, filePath);
}

function queueActivityUpdate(filePath, update) {
    const previousWrite = activityWriteQueues.get(filePath) ?? Promise.resolve();
    const write = previousWrite.then(update);
    const queueTail = write.catch(() => undefined);
    activityWriteQueues.set(filePath, queueTail);
    void queueTail.finally(() => {
        if (activityWriteQueues.get(filePath) === queueTail) activityWriteQueues.delete(filePath);
    });

    return write;
}

async function updateActivity(project, projectFolder, origin, update) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { absolutePath, relativePath } = resolveActivityPath(rootPath, projectFolder, origin);
    const activity = await queueActivityUpdate(absolutePath, async () => {
        const current = await readActivityFile(absolutePath, origin);
        const next = update(current);
        await writeActivityFile(absolutePath, next);

        return next;
    });

    return { activity, relativePath };
}

async function updateAndCommitActivity(project, projectFolder, origin, update, message) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { absolutePath, relativePath } = resolveActivityPath(rootPath, projectFolder, origin);

    return queueActivityUpdate(absolutePath, async () => {
        const current = await readActivityFile(absolutePath, origin);
        const next = update(current);
        await writeActivityFile(absolutePath, next);
        const commit = await commitTrackedPaths(rootPath, [relativePath], message);

        return { activity: next, commit, relativePath };
    });
}

async function appendActionActivity(project, projectFolder, origin, record) {
    return updateActivity(project, projectFolder, origin, (activity) => ({
        ...activity,
        records: [...activity.records, record],
    }));
}

async function appendAndCommitActionActivity(project, projectFolder, origin, record, message) {
    return updateAndCommitActivity(project, projectFolder, origin, (activity) => ({
        ...activity,
        records: [...activity.records, record],
    }), message);
}

function upsertConversation(activity, conversation) {
    const storedConversation = Object.fromEntries(Object.entries(conversation).filter(([fieldName]) => fieldName !== 'path'));

    return {
        ...activity,
        conversations: activity.conversations.some(({ id }) => id === storedConversation.id)
            ? activity.conversations.map((current) => (current.id === storedConversation.id ? storedConversation : current))
            : [...activity.conversations, storedConversation],
    };
}

async function upsertActivityConversation(project, projectFolder, origin, conversation) {
    return updateActivity(project, projectFolder, origin, (activity) => upsertConversation(activity, conversation));
}

async function upsertAndCommitActivityConversation(project, projectFolder, origin, conversation, message) {
    return updateAndCommitActivity(
        project,
        projectFolder,
        origin,
        (activity) => upsertConversation(activity, conversation),
        message,
    );
}

async function loadActivityConversation(project, reference) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { activityPath, conversationId } = parseConversationActivityReference(reference);
    const absolutePath = ensureInsideRoot(rootPath, path.join(rootPath, activityPath));
    const activity = parseActivityFile(await fs.promises.readFile(absolutePath, 'utf8'));
    const conversation = findActivityConversation(activity, conversationId);

    return { ...conversation, path: reference };
}

async function listAgentConversationReferences(project, projectFolder) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const origin = { kind: 'project' };
    const { absolutePath, relativePath } = resolveActivityPath(rootPath, projectFolder, origin);
    const activity = await readActivityFile(absolutePath, origin);

    return activity.conversations.map(({ id }) => conversationActivityReference(relativePath, id));
}

async function visibleCommit(rootPath, primaryBranch, validBranches, commit) {
    const available = await commitExists(rootPath, commit.commit);
    if (!available) {
        return commit.branch === primaryBranch || validBranches.has(commit.branch)
            ? { ...commit, available: false }
            : null;
    }
    if (await isCommitAncestor(rootPath, commit.commit, `refs/heads/${primaryBranch}`)) return { ...commit, available: true };
    if (!validBranches.has(commit.branch)) return null;

    return await isCommitAncestor(rootPath, commit.commit, `refs/heads/${commit.branch}`)
        ? { ...commit, available: true }
        : null;
}

async function runVisibilityWorker(state) {
    while (state.nextIndex < state.tasks.length) {
        const taskIndex = state.nextIndex;
        state.nextIndex += 1;
        const { commit } = state.tasks[taskIndex];
        state.results[taskIndex] = await visibleCommit(state.rootPath, state.primaryBranch, state.validBranches, commit);
    }
}

async function filterVisibleCommits(rootPath, primaryBranch, validBranches, records) {
    const tasks = records.flatMap((record, recordIndex) => (
        record.commits.map((commit) => ({ commit, recordIndex }))
    ));
    const state = { nextIndex: 0, primaryBranch, results: Array(tasks.length), rootPath, tasks, validBranches };
    const workerCount = Math.min(VISIBILITY_CHECK_CONCURRENCY, tasks.length);
    await Promise.all(Array.from({ length: workerCount }, () => runVisibilityWorker(state)));
    const commitsByRecord = records.map(() => []);
    for (const [taskIndex, visible] of state.results.entries()) {
        if (!visible) continue;
        commitsByRecord[tasks[taskIndex].recordIndex].push(visible);
    }

    return records.map((record, recordIndex) => ({ ...record, commits: commitsByRecord[recordIndex] }));
}

async function loadCardActivity(project, projectFolder, cardInternalId, worktrees) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!Array.isArray(worktrees)) throw new Error('Missing registered worktrees');
    const origin = { cardInternalId, kind: 'card' };
    const { absolutePath } = resolveActivityPath(rootPath, projectFolder, origin);
    const activity = await readActivityFile(absolutePath, origin);
    const validBranches = new Set(worktrees.filter(({ valid }) => valid).map(({ branch }) => branch));
    const records = await filterVisibleCommits(rootPath, project.branch, validBranches, activity.records);

    return { ...activity, records };
}

function activityConversationReference(projectFolder, origin, conversationId) {
    return conversationActivityReference(activityFilePath(projectFolder, origin), conversationId);
}

module.exports = {
    activityConversationReference,
    appendAndCommitActionActivity,
    appendActionActivity,
    listAgentConversationReferences,
    loadCardActivity,
    loadActivityConversation,
    readActivityFile,
    resolveActivityPath,
    upsertAndCommitActivityConversation,
    upsertActivityConversation,
};
