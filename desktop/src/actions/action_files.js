const fs = require('node:fs');
const path = require('node:path');

const {
    assertGitRoot,
    ensureInsideRoot,
    pathExists,
    requireRootPath,
} = require('../git/git_commands');
const {
    ACTION_SCHEDULES_FILE,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    parseActionScheduleFile,
} = require('./schedule_store');
const { normalizePath } = require('../../../shared/path_utils.mjs');
const { parseAgentConversation } = require('../../../shared/agent_conversations.mjs');
const { actionHistoryFilePath } = require('./project_log_paths');

const JSON_EXTENSION = '.json';
const actionHistoryWriteQueues = new Map();
const COMMIT_STAT_FIELDS = ['filesChanged', 'insertions', 'deletions'];

function scheduleFilePath(rootPath, actionsFolder) {
    const actionsFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, actionsFolder));

    return ensureInsideRoot(rootPath, path.join(actionsFolderPath, ACTION_SCHEDULES_FILE));
}

async function readJsonArray(filePath) {
    if (!await pathExists(filePath)) return [];

    const content = await fs.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error('Action history file must contain an array');

    return parsed;
}

function requireCommitStat(value, fieldName) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`Malformed action history: ${fieldName} must be a non-negative integer`);
}

function validateCommitReference(commitReference, entryIndex, commitIndex) {
    if (!commitReference || typeof commitReference !== 'object' || Array.isArray(commitReference)) {
        throw new Error(`Malformed action history: entries[${entryIndex}].commits[${commitIndex}] must be an object`);
    }
    const fieldPath = `entries[${entryIndex}].commits[${commitIndex}]`;
    for (const field of COMMIT_STAT_FIELDS) requireCommitStat(commitReference[field], `${fieldPath}.${field}`);
}

function validateActionHistory(entries) {
    for (const [entryIndex, entry] of entries.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Malformed action history: entries[${entryIndex}] must be an object`);
        }
        if (entry.commits === undefined) continue;
        if (!Array.isArray(entry.commits)) throw new Error(`Malformed action history: entries[${entryIndex}].commits must be an array`);
        entry.commits.forEach((commitReference, commitIndex) => validateCommitReference(commitReference, entryIndex, commitIndex));
    }

    return entries;
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

async function loadActionRunHistory(project, request) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!request || typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action history actionId');
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action history context');
    if (typeof request.projectFolder !== 'string') throw new Error('Missing action history projectFolder');

    const filePath = actionHistoryFilePath(rootPath, request.projectFolder, request.actionId, request.context);

    return validateActionHistory(await readJsonArray(filePath));
}

async function writeActionRunHistory(rootPath, filePath, entry) {
    await assertGitRoot(rootPath);
    const entries = await readJsonArray(filePath);
    const nextEntries = [...entries, entry];
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, `${JSON.stringify(nextEntries, null, 2)}\n`);

    return nextEntries;
}

function queueActionRunHistoryWrite(rootPath, filePath, entry) {
    const previousWrite = actionHistoryWriteQueues.get(filePath) ?? Promise.resolve();
    const write = previousWrite.then(() => writeActionRunHistory(rootPath, filePath, entry));
    const queueTail = write.catch(() => undefined);
    actionHistoryWriteQueues.set(filePath, queueTail);
    void queueTail.finally(() => {
        if (actionHistoryWriteQueues.get(filePath) === queueTail) actionHistoryWriteQueues.delete(filePath);
    });

    return write;
}

async function appendActionRunHistory(project, request, entry) {
    const rootPath = requireRootPath(project);
    if (!request || typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action history actionId');
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action history context');
    if (typeof request.projectFolder !== 'string') throw new Error('Missing action history projectFolder');

    const filePath = actionHistoryFilePath(rootPath, request.projectFolder, request.actionId, request.context);

    return queueActionRunHistoryWrite(rootPath, filePath, entry);
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
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (typeof referencePath !== 'string' || referencePath.length === 0) throw new Error('Missing agent log path');

    const filePath = ensureInsideRoot(rootPath, path.join(rootPath, referencePath));
    const content = await fs.promises.readFile(filePath, 'utf8');

    return parseAgentConversation(content, referencePath);
}

module.exports = {
    appendActionRunHistory,
    cancelActionSchedule,
    loadActionFiles,
    loadActionRunHistory,
    loadActionSchedules,
    loadAgentConversation,
    saveActionSchedules,
};
