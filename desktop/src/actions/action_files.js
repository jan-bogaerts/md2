const fs = require('node:fs')
const path = require('node:path')

const {
    assertGitRoot,
    ensureInsideRoot,
    pathExists,
    requireRootPath,
} = require('../git/git_commands')
const {
    ACTION_SCHEDULES_FILE,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    parseActionScheduleFile,
} = require('./schedule_store')
const { normalizePath } = require('../../../shared/path_utils.mjs')

const JSON_EXTENSION = '.json'
const ACTION_HISTORY_FOLDER = '.md2-action-history'
const AGENT_MESSAGE_ROLES = new Set(['agent', 'assistant', 'stderr', 'stdout', 'system', 'user'])
const AGENT_STATUSES = new Set(['cancelled', 'completed', 'failed', 'running'])

function safeHistorySegment(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function contextHistoryKey(context) {
    const file = typeof context.file === 'string' ? context.file : ''
    const folder = typeof context.folder === 'string' ? context.folder : ''
    const kind = typeof context.kind === 'string' ? context.kind : ''

    return safeHistorySegment(`${kind}_${file || folder || 'context'}`)
}

function historyFilePath(rootPath, actionsFolder, actionId, context) {
    const actionsFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, actionsFolder))
    const historyFolderPath = ensureInsideRoot(rootPath, path.join(actionsFolderPath, ACTION_HISTORY_FOLDER))
    const fileName = `${safeHistorySegment(actionId)}_${contextHistoryKey(context)}.json`

    return ensureInsideRoot(rootPath, path.join(historyFolderPath, fileName))
}

function scheduleFilePath(rootPath, actionsFolder) {
    const actionsFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, actionsFolder))

    return ensureInsideRoot(rootPath, path.join(actionsFolderPath, ACTION_SCHEDULES_FILE))
}

async function readJsonArray(filePath) {
    if (!await pathExists(filePath)) return []

    const content = await fs.promises.readFile(filePath, 'utf8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) throw new Error('Action history file must contain an array')

    return parsed
}

async function readActionScheduleFile(filePath) {
    if (!await pathExists(filePath)) return { schedules: [] }

    const content = await fs.promises.readFile(filePath, 'utf8')

    return parseActionScheduleFile(JSON.parse(content))
}

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed agent log: missing ${fieldName}`)

    return value
}

function requireArray(value, fieldName) {
    if (!Array.isArray(value)) throw new Error(`Malformed agent log: ${fieldName} must be an array`)

    return value
}

function requireText(value, fieldName) {
    if (typeof value !== 'string') throw new Error(`Malformed agent log: missing ${fieldName}`)

    return value
}

function normalizeAgentMessage(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed agent log: messages[${index}] must be an object`)
    const role = requireString(value.role, `messages[${index}].role`)
    if (!AGENT_MESSAGE_ROLES.has(role)) throw new Error(`Malformed agent log: invalid messages[${index}].role ${role}`)

    return {
        ...(value.agent === undefined ? {} : { agent: requireString(value.agent, `messages[${index}].agent`) }),
        content: requireText(value.content, `messages[${index}].content`),
        id: requireString(value.id, `messages[${index}].id`),
        role,
        timestamp: requireString(value.timestamp, `messages[${index}].timestamp`),
    }
}

function normalizeAgentEvent(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed agent log: events[${index}] must be an object`)

    return {
        content: requireText(value.content, `events[${index}].content`),
        id: requireString(value.id, `events[${index}].id`),
        timestamp: requireString(value.timestamp, `events[${index}].timestamp`),
        type: requireString(value.type, `events[${index}].type`),
    }
}

function normalizeProviderSession(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed agent log: providerSessions[${index}] must be an object`)

    return {
        agent: requireString(value.agent, `providerSessions[${index}].agent`),
        conversationId: requireString(value.conversationId, `providerSessions[${index}].conversationId`),
        createdAt: requireString(value.createdAt, `providerSessions[${index}].createdAt`),
        lastUsedAt: requireString(value.lastUsedAt, `providerSessions[${index}].lastUsedAt`),
        synchronizedThroughMessageId: requireString(value.synchronizedThroughMessageId, `providerSessions[${index}].synchronizedThroughMessageId`),
    }
}

function normalizeAgentConversation(content, referencePath) {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed agent log: root must be an object')

    const status = requireString(parsed.status, 'status')
    if (!AGENT_STATUSES.has(status)) throw new Error(`Malformed agent log: invalid status ${status}`)

    return {
        actionId: parsed.actionId === null || parsed.actionId === undefined ? null : requireString(parsed.actionId, 'actionId'),
        cardPath: parsed.cardPath === null || parsed.cardPath === undefined ? null : requireString(parsed.cardPath, 'cardPath'),
        completedAt: parsed.completedAt === null || parsed.completedAt === undefined ? null : requireString(parsed.completedAt, 'completedAt'),
        events: parsed.events === undefined ? [] : requireArray(parsed.events, 'events').map(normalizeAgentEvent),
        id: requireString(parsed.id, 'id'),
        messages: requireArray(parsed.messages, 'messages').map(normalizeAgentMessage),
        path: referencePath,
        providerSessions: parsed.providerSessions === undefined ? [] : requireArray(parsed.providerSessions, 'providerSessions').map(normalizeProviderSession),
        startedAt: requireString(parsed.startedAt, 'startedAt'),
        status,
        title: typeof parsed.title === 'string' && parsed.title.length > 0 ? parsed.title : parsed.id,
    }
}

async function loadActionFiles(project, actionsFolder) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const actionsFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, actionsFolder))
    if (!await pathExists(actionsFolderPath)) return []

    const entries = await fs.promises.readdir(actionsFolderPath, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        if (entry.isFile() && entry.name !== ACTION_SCHEDULES_FILE && entry.name.toLowerCase().endsWith(JSON_EXTENSION)) {
            const entryPath = path.join(actionsFolderPath, entry.name)
            const content = await fs.promises.readFile(entryPath, 'utf8')
            files.push({ content, path: normalizePath(path.relative(rootPath, entryPath)) })
        }
    }

    return files
}

async function loadActionRunHistory(project, request) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (!request || typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action history actionId')
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action history context')
    if (typeof request.actionsFolder !== 'string' || request.actionsFolder.length === 0) throw new Error('Missing action history actionsFolder')

    const filePath = historyFilePath(rootPath, request.actionsFolder, request.actionId, request.context)

    return readJsonArray(filePath)
}

async function appendActionRunHistory(project, request, entry) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (!request || typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action history actionId')
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action history context')
    if (typeof request.actionsFolder !== 'string' || request.actionsFolder.length === 0) throw new Error('Missing action history actionsFolder')

    const filePath = historyFilePath(rootPath, request.actionsFolder, request.actionId, request.context)
    const entries = await readJsonArray(filePath)
    const nextEntries = [...entries, entry]
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, `${JSON.stringify(nextEntries, null, 2)}\n`)

    return nextEntries
}

async function loadActionSchedules(project, actionsFolder) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (typeof actionsFolder !== 'string' || actionsFolder.length === 0) throw new Error('Missing action schedules actionsFolder')

    const filePath = scheduleFilePath(rootPath, actionsFolder)
    const file = await readActionScheduleFile(filePath)

    return file.schedules
}

async function saveActionSchedules(project, actionsFolder, schedules) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (typeof actionsFolder !== 'string' || actionsFolder.length === 0) throw new Error('Missing action schedules actionsFolder')
    if (!Array.isArray(schedules)) throw new Error('Missing action schedules')

    const filePath = scheduleFilePath(rootPath, actionsFolder)
    const file = createActionScheduleFile(schedules)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`)

    return file.schedules
}

async function cancelActionSchedule(project, actionsFolder, scheduleId) {
    if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id')

    const schedules = await loadActionSchedules(project, actionsFolder)
    const nextSchedules = cancelPendingActionSchedule(schedules, scheduleId)

    return saveActionSchedules(project, actionsFolder, nextSchedules)
}

async function loadAgentConversation(project, referencePath) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (typeof referencePath !== 'string' || referencePath.length === 0) throw new Error('Missing agent log path')

    const filePath = ensureInsideRoot(rootPath, path.join(rootPath, referencePath))
    const content = await fs.promises.readFile(filePath, 'utf8')

    return normalizeAgentConversation(content, referencePath)
}

module.exports = {
    appendActionRunHistory,
    cancelActionSchedule,
    loadActionFiles,
    loadActionRunHistory,
    loadActionSchedules,
    loadAgentConversation,
    saveActionSchedules,
}
