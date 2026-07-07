const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
    assertGitRoot,
    ensureInsideRoot,
    requireRootPath,
} = require('./git_commands')
const {
    ACTION_SCHEDULES_FILE,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    parseActionScheduleFile,
} = require('./schedule_store')

const JSON_EXTENSION = '.json'
const ACTION_HISTORY_FOLDER = '.md2-action-history'

function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/')
}

async function pathExists(targetPath) {
    try {
        await fs.promises.access(targetPath)
        return true
    } catch {
        return false
    }
}

function runProcessWithInput(command, input, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, { cwd, shell: true })
        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString()
        })
        child.on('error', reject)
        child.on('close', (code) => {
            resolve({ exitCode: typeof code === 'number' ? code : 1, stderr, stdout })
        })
        child.stdin.end(input)
    })
}

function safeHistorySegment(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function contextHistoryKey(context) {
    const file = typeof context.file === 'string' ? context.file : ''
    const folder = typeof context.folder === 'string' ? context.folder : ''
    const kind = typeof context.kind === 'string' ? context.kind : ''

    return safeHistorySegment(`${kind}_${file || folder || 'context'}`)
}

function historyFilePath(rootPath, actionsFolder, actionName, context) {
    const actionsFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, actionsFolder))
    const historyFolderPath = ensureInsideRoot(rootPath, path.join(actionsFolderPath, ACTION_HISTORY_FOLDER))
    const fileName = `${safeHistorySegment(actionName)}_${contextHistoryKey(context)}.json`

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

function normalizeAgentConversation(content, referencePath) {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed agent log: root must be an object')

    return {
        cardPath: requireString(parsed.cardPath, 'cardPath'),
        completedAt: parsed.completedAt === null || parsed.completedAt === undefined ? null : requireString(parsed.completedAt, 'completedAt'),
        continuedFrom: parsed.continuedFrom === null || parsed.continuedFrom === undefined ? null : requireString(parsed.continuedFrom, 'continuedFrom'),
        events: Array.isArray(parsed.events) ? parsed.events : [],
        id: requireString(parsed.id, 'id'),
        messages: requireArray(parsed.messages, 'messages'),
        nativeSessionId: parsed.nativeSessionId === null || parsed.nativeSessionId === undefined ? null : requireString(parsed.nativeSessionId, 'nativeSessionId'),
        path: referencePath,
        startedAt: requireString(parsed.startedAt, 'startedAt'),
        status: requireString(parsed.status, 'status'),
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
    if (!request || typeof request.actionName !== 'string' || request.actionName.length === 0) throw new Error('Missing action history actionName')
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action history context')
    if (typeof request.actionsFolder !== 'string' || request.actionsFolder.length === 0) throw new Error('Missing action history actionsFolder')

    const filePath = historyFilePath(rootPath, request.actionsFolder, request.actionName, request.context)

    return readJsonArray(filePath)
}

async function appendActionRunHistory(project, request, entry) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (!request || typeof request.actionName !== 'string' || request.actionName.length === 0) throw new Error('Missing action history actionName')
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action history context')
    if (typeof request.actionsFolder !== 'string' || request.actionsFolder.length === 0) throw new Error('Missing action history actionsFolder')

    const filePath = historyFilePath(rootPath, request.actionsFolder, request.actionName, request.context)
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

async function runAgent(project, request) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (!request || typeof request.command !== 'string' || request.command.length === 0) throw new Error('Missing agent command')
    if (typeof request.prompt !== 'string' || request.prompt.length === 0) throw new Error('Missing agent prompt')

    const { exitCode, stderr, stdout } = await runProcessWithInput(request.command, request.prompt, rootPath)

    return { command: request.command, exitCode, prompt: request.prompt, stderr, stdout }
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
    runAgent,
    saveActionSchedules,
}
