const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
    compactActivityFileContent,
    createActivityFile,
    findActivityConversation,
    parseActivityValue,
    parseActivityValueForMigration,
} = require('../../../../shared/card_activity.mjs');
const { parseAgentConversationValue } = require('../../../../shared/agent_conversations.mjs');
const {
    activityOriginFromPath,
    activityFilePath,
    conversationActivityReference,
    parseConversationActivityReference,
} = require('../../../../shared/activity_paths.mjs');
const {
    assertGitRoot,
    commitExists,
    commitTrackedPaths,
    ensureInsideRoot,
    isCommitAncestor,
    pathExists,
    requireRootPath,
} = require('../../git/git_commands');

const activityWriteQueues = new Map();
const unwrittenActivityValues = new Map();
const ACTIVITY_RENAME_RETRY_DELAYS_MS = [25, 50, 100, 200];
const RETRYABLE_RENAME_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);
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

async function readStoredActivity(filePath) {
    const unwritten = unwrittenActivityValues.get(filePath);
    if (unwritten) return { value: unwritten };
    if (!await pathExists(filePath)) return { value: null };
    const value = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));

    return { value };
}

async function readStoredActivityContent(filePath) {
    const unwritten = unwrittenActivityValues.get(filePath);
    if (unwritten) return JSON.stringify(unwritten);

    return fs.promises.readFile(filePath, 'utf8');
}

function activityValue(stored, origin) {
    return stored.value === null ? createActivityFile(origin) : parseActivityValueForMigration(stored.value, origin);
}

async function loadActivityValue(filePath, origin) {
    return activityValue(await readStoredActivity(filePath, origin), origin);
}

async function readActivityFile(filePath, origin) {
    return activityValue(await readStoredActivity(filePath, origin), origin);
}

function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function renameActivityFile(temporaryPath, filePath) {
    for (const retryDelay of ACTIVITY_RENAME_RETRY_DELAYS_MS) {
        try {
            await fs.promises.rename(temporaryPath, filePath);

            return;
        } catch (error) {
            if (!RETRYABLE_RENAME_ERROR_CODES.has(error?.code)) throw error;
            await delay(retryDelay);
        }
    }

    await fs.promises.rename(temporaryPath, filePath);
}

async function writeActivityFile(filePath, activity) {
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    try {
        await fs.promises.writeFile(temporaryPath, `${JSON.stringify(activity, null, 2)}\n`);
        await renameActivityFile(temporaryPath, filePath);
        unwrittenActivityValues.delete(filePath);
    } catch (error) {
        unwrittenActivityValues.set(filePath, activity);

        throw error;
    } finally {
        await fs.promises.rm(temporaryPath, { force: true });
    }
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
        const current = await loadActivityValue(absolutePath, origin);
        const next = update(current);
        await writeActivityFile(absolutePath, next);

        return next;
    });

    return { activity, relativePath };
}

async function ensureActivityFile(project, projectFolder, origin) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { absolutePath, relativePath } = resolveActivityPath(rootPath, projectFolder, origin);
    await queueActivityUpdate(absolutePath, async () => {
        if (await pathExists(absolutePath)) return;

        await writeActivityFile(absolutePath, createActivityFile(origin));
    });

    return relativePath;
}

async function updateAndCommitActivity(project, projectFolder, origin, update, message) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { absolutePath, relativePath } = resolveActivityPath(rootPath, projectFolder, origin);

    return queueActivityUpdate(absolutePath, async () => {
        const current = await loadActivityValue(absolutePath, origin);
        const next = update(current);
        await writeActivityFile(absolutePath, next);
        const commit = await commitTrackedPaths(rootPath, [relativePath], message);

        return { activity: next, commit, relativePath };
    });
}

async function compactActivityFiles(project, activityPaths) {
    if (!Array.isArray(activityPaths)) throw new Error('Missing activity paths for compaction');
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);

    return Promise.all(activityPaths.map((activityPath) => {
        if (typeof activityPath !== 'string' || activityPath.length === 0) {
            throw new Error('Invalid activity path for compaction');
        }
        const origin = activityOriginFromPath(activityPath);
        if (!origin) throw new Error(`Invalid activity path for compaction: ${activityPath}`);
        const absolutePath = ensureInsideRoot(rootPath, path.join(rootPath, activityPath));

        return queueActivityUpdate(absolutePath, async () => {
            const content = await readStoredActivityContent(absolutePath);
            const result = compactActivityFileContent(content, origin);
            if (result.status === 'valid' && result.changed) await writeActivityFile(absolutePath, result.activity);

            return { ...result, path: activityPath };
        });
    }));
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

async function appendAndCommitSystemActivity(project, projectFolder, origin, record, message) {
    return updateAndCommitActivity(project, projectFolder, origin, (activity) => ({
        ...activity,
        records: [...activity.records, record],
    }), message);
}

function upsertConversation(activity, conversation) {
    if (typeof conversation.viewed !== 'boolean') throw new Error('Missing agent conversation viewed');
    const canonicalConversation = parseAgentConversationValue(conversation, conversation.path ?? '');
    const storedConversation = Object.fromEntries(Object.entries(canonicalConversation).filter(([fieldName]) => fieldName !== 'path'));

    return {
        ...activity,
        conversations: activity.conversations.some(({ id }) => id === storedConversation.id)
            ? activity.conversations.map((current) => (
                current.id === storedConversation.id ? { ...storedConversation, viewed: current.viewed } : current
            ))
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

async function updateActivityConversationViewed(project, reference, viewed) {
    if (typeof reference !== 'string' || reference.length === 0) throw new Error('Missing agent conversation reference');
    if (typeof viewed !== 'boolean') throw new Error('Invalid agent conversation viewed');

    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { activityPath, conversationId } = parseConversationActivityReference(reference);
    const absolutePath = ensureInsideRoot(rootPath, path.join(rootPath, activityPath));

    return queueActivityUpdate(absolutePath, async () => {
        const stored = await readStoredActivity(absolutePath);
        const activity = activityValue(stored);
        const conversation = findActivityConversation(activity, conversationId);
        const updatedConversation = { ...conversation, viewed };
        const updatedActivity = {
            ...activity,
            conversations: activity.conversations.map((current) => (
                current.id === conversationId ? { ...current, viewed } : current
            )),
        };
        await writeActivityFile(absolutePath, updatedActivity);

        return { ...updatedConversation, path: reference };
    });
}

async function updateCardActionSettings(project, projectFolder, cardInternalId, actionId, settings) {
    if (typeof cardInternalId !== 'string' || cardInternalId.length === 0) throw new Error('Missing card action settings cardInternalId');
    if (typeof actionId !== 'string' || actionId.length === 0) throw new Error('Missing card action settings actionId');
    const origin = { cardInternalId, kind: 'card' };
    const validationActivity = createActivityFile(origin);
    validationActivity.actionSettings[actionId] = settings;
    const validatedSettings = parseActivityValue(validationActivity, origin).actionSettings[actionId];

    return updateActivity(project, projectFolder, origin, (activity) => ({
        ...activity,
        actionSettings: { ...activity.actionSettings, [actionId]: validatedSettings },
    }));
}

async function loadActivityConversation(project, reference) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { activityPath, conversationId } = parseConversationActivityReference(reference);
    const absolutePath = ensureInsideRoot(rootPath, path.join(rootPath, activityPath));
    const activity = await readActivityFile(absolutePath);
    const conversation = findActivityConversation(activity, conversationId);

    return { ...conversation, path: reference };
}

async function loadActivityConversations(project, activityPath) {
    if (typeof activityPath !== 'string' || activityPath.length === 0) throw new Error('Missing activity path');
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const absolutePath = ensureInsideRoot(rootPath, path.join(rootPath, activityPath));
    const activity = await readActivityFile(absolutePath);

    return activity.conversations.map((conversation) => ({
        ...conversation,
        path: conversationActivityReference(activityPath, conversation.id),
    }));
}

async function closeWaitingActivityConversation(project, reference, status) {
    if (typeof reference !== 'string' || reference.length === 0) throw new Error('Missing agent conversation reference');
    if (status !== 'completed' && status !== 'cancelled') throw new Error(`Invalid waiting conversation terminal status: ${status}`);

    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { activityPath, conversationId } = parseConversationActivityReference(reference);
    const absolutePath = ensureInsideRoot(rootPath, path.join(rootPath, activityPath));

    return queueActivityUpdate(absolutePath, async () => {
        const stored = await readStoredActivity(absolutePath);
        const activity = activityValue(stored);
        const conversation = findActivityConversation(activity, conversationId);
        if (conversation.status !== 'waitingForInput') {
            throw new Error(`Agent conversation is no longer waiting for input: ${reference}`);
        }

        const completedAt = new Date().toISOString();
        const updatedActivity = {
            ...activity,
            conversations: activity.conversations.map((storedConversation) => (
                storedConversation.id === conversationId
                    ? { ...storedConversation, completedAt, status, viewed: conversation.viewed }
                    : storedConversation
            )),
        };
        await writeActivityFile(absolutePath, updatedActivity);
        const updatedConversation = findActivityConversation(parseActivityValue(updatedActivity), conversationId);

        return { ...updatedConversation, path: reference };
    });
}

/**
 * Marks the questions of a conversation the user reopened after the agent stopped as dismissed, by appending the
 * same `questionsDismissed` entry a live dismissal writes, so the restored question box stays gone across restarts.
 */
async function dismissWaitingActivityConversationQuestions(project, reference) {
    if (typeof reference !== 'string' || reference.length === 0) throw new Error('Missing agent conversation reference');

    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const { activityPath, conversationId } = parseConversationActivityReference(reference);
    const absolutePath = ensureInsideRoot(rootPath, path.join(rootPath, activityPath));

    return queueActivityUpdate(absolutePath, async () => {
        const stored = await readStoredActivity(absolutePath);
        const activity = activityValue(stored);
        const conversation = findActivityConversation(activity, conversationId);
        if (conversation.status !== 'waitingForInput') {
            throw new Error(`Agent conversation is no longer waiting for input: ${reference}`);
        }
        const lastEntry = conversation.entries.at(-1);
        if (!lastEntry || lastEntry.kind !== 'event' || lastEntry.type !== 'agentQuestion') {
            throw new Error(`Agent conversation has no pending question: ${reference}`);
        }

        const timestamp = new Date().toISOString();
        const sequence = Number.isSafeInteger(lastEntry.sequence) ? lastEntry.sequence + 1 : undefined;
        const dismissal = {
            content: '',
            id: `${conversationId}-questions-dismissed-${conversation.entries.length}`,
            kind: 'event',
            label: 'Questions dismissed',
            ...(sequence === undefined ? {} : { sequence }),
            status: 'completed',
            timestamp,
            type: 'questionsDismissed',
        };
        const updatedActivity = {
            ...activity,
            conversations: activity.conversations.map((storedConversation) => (
                storedConversation.id === conversationId
                    ? { ...storedConversation, entries: [...storedConversation.entries, dismissal] }
                    : storedConversation
            )),
        };
        await writeActivityFile(absolutePath, updatedActivity);
        const updatedConversation = findActivityConversation(parseActivityValue(updatedActivity), conversationId);

        return { ...updatedConversation, path: reference };
    });
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
    if (!Array.isArray(worktrees)) throw new Error('Missing linked worktrees');
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
    appendAndCommitSystemActivity,
    appendActionActivity,
    closeWaitingActivityConversation,
    dismissWaitingActivityConversationQuestions,
    compactActivityFiles,
    ensureActivityFile,
    listAgentConversationReferences,
    loadActivityConversations,
    loadCardActivity,
    loadActivityConversation,
    loadActivityValue,
    queueActivityUpdate,
    readActivityFile,
    resolveActivityPath,
    upsertConversation,
    upsertAndCommitActivityConversation,
    upsertActivityConversation,
    updateCardActionSettings,
    updateActivityConversationViewed,
    writeActivityFile,
};
