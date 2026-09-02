const fs = require('node:fs');
const path = require('node:path');

const {
    assertGitRoot,
    ensureInsideRoot,
    pathExists,
    requireRootPath,
} = require('../../git/git_commands');
const {
    ACTION_SCHEDULES_FILE,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    parseActionScheduleFile,
} = require('../schedule/schedule_store');
const { normalizePath } = require('../../../../shared/path_utils.mjs');
const { loadActivityConversation, readActivityFile, resolveActivityPath } = require('../activity/activity_files');

const JSON_EXTENSION = '.json';

function scheduleFilePath(rootPath, actionsFolder) {
    const actionsFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, actionsFolder));

    return ensureInsideRoot(rootPath, path.join(actionsFolderPath, ACTION_SCHEDULES_FILE));
}

// History ownership follows the presence of cardInternalId, not the context kind.
function activityOrigin(context) {
    if (typeof context.cardInternalId !== 'string' || context.cardInternalId.length === 0) return { kind: 'project' };

    return { cardInternalId: context.cardInternalId, kind: 'card' };
}

function historyEntry(record, repositoryRoot) {
    // Activity files stay machine-independent. Reintroduce the checkout root and
    // performer defaults only in the legacy action-history response consumed by DiffView.
    const commits = record.commits.map((commit) => ({
        ...commit,
        actionId: commit.actionId ?? record.rootActionId,
        actionName: commit.actionName ?? record.rootActionLabel,
        repositoryRoot,
    }));

    const entry = {
        ...record.details,
        completedAt: record.completedAt,
        ...(commits.length > 0 ? { commits } : {}),
        ...(record.rootConversationId ? { rootConversationId: record.rootConversationId } : {}),
        startedAt: record.startedAt,
        status: record.status,
    };

    return entry;
}

async function readActionScheduleFile(filePath) {
    if (!await pathExists(filePath)) return { schedules: [] };

    const content = await fs.promises.readFile(filePath, 'utf8');

    return parseActionScheduleFile(JSON.parse(content));
}

async function loadActionFiles(project, actionsFolder) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const actionsFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, actionsFolder));
    if (!await pathExists(actionsFolderPath)) return [];

    const entries = await fs.promises.readdir(actionsFolderPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.isFile() && entry.name !== ACTION_SCHEDULES_FILE && entry.name.toLowerCase().endsWith(JSON_EXTENSION)) {
            const entryPath = path.join(actionsFolderPath, entry.name);
            const content = await fs.promises.readFile(entryPath, 'utf8');
            files.push({ content, path: normalizePath(path.relative(rootPath, entryPath)) });
        }
    }

    return files;
}

async function loadActionFile(project, actionPath) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (typeof actionPath !== 'string' || actionPath.length === 0) throw new Error('Missing action path');
    if (!actionPath.toLowerCase().endsWith(JSON_EXTENSION)) throw new Error('Action file must be JSON');

    const filePath = ensureInsideRoot(rootPath, path.join(rootPath, actionPath));
    const content = await fs.promises.readFile(filePath, 'utf8');

    return { content, path: normalizePath(path.relative(rootPath, filePath)) };
}

async function loadActionRunHistory(project, request) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!request || typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action history actionId');
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action history context');
    if (typeof request.projectFolder !== 'string') throw new Error('Missing action history projectFolder');

    const origin = activityOrigin(request.context);
    const { absolutePath } = resolveActivityPath(rootPath, request.projectFolder, origin);
    const activity = await readActivityFile(absolutePath, origin);

    return activity.records
        .filter(({ rootActionId }) => rootActionId === request.actionId)
        .map((record) => historyEntry(record, rootPath));
}

async function loadActionSchedules(project, actionsFolder) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (typeof actionsFolder !== 'string' || actionsFolder.length === 0) throw new Error('Missing action schedules actionsFolder');

    const filePath = scheduleFilePath(rootPath, actionsFolder);
    const file = await readActionScheduleFile(filePath);

    return file.schedules;
}

async function saveActionSchedules(project, actionsFolder, schedules) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (typeof actionsFolder !== 'string' || actionsFolder.length === 0) throw new Error('Missing action schedules actionsFolder');
    if (!Array.isArray(schedules)) throw new Error('Missing action schedules');

    const filePath = scheduleFilePath(rootPath, actionsFolder);
    const file = createActionScheduleFile(schedules);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`);

    return file.schedules;
}

async function cancelActionSchedule(project, actionsFolder, scheduleId) {
    if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id');

    const schedules = await loadActionSchedules(project, actionsFolder);
    const nextSchedules = cancelPendingActionSchedule(schedules, scheduleId);

    return saveActionSchedules(project, actionsFolder, nextSchedules);
}

async function loadAgentConversation(project, referencePath) {
    if (typeof referencePath !== 'string' || referencePath.length === 0) throw new Error('Missing agent conversation reference');

    return loadActivityConversation(project, referencePath);
}

module.exports = {
    cancelActionSchedule,
    loadActionFile,
    loadActionFiles,
    loadActionRunHistory,
    loadActionSchedules,
    loadAgentConversation,
    saveActionSchedules,
};
