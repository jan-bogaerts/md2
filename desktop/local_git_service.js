const { exec, execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)
const MARKDOWN_EXTENSION = '.md'
const JSON_EXTENSION = '.json'
const PROJECT_CONFIG_PATH = 'md2.config.json'
const ACTION_HISTORY_FOLDER = '.md2-action-history'
const ACTION_SCHEDULES_FILE = '.md2-schedules.json'
const GIT_FOLDER = '.git'
const ACTION_SCHEDULE_STATUSES = ['cancelled', 'done', 'pending', 'running']
const ACTION_CONTEXT_KINDS = ['card', 'file', 'folder']

function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/')
}

function requireRootPath(project) {
    if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) {
        throw new Error('Missing local Git project rootPath')
    }

    return project.rootPath
}

function ensureInsideRoot(rootPath, targetPath) {
    const resolvedRoot = path.resolve(rootPath)
    const resolvedTarget = path.resolve(targetPath)

    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error('Local Git path escapes project root')
    }

    return resolvedTarget
}

async function pathExists(targetPath) {
    try {
        await fs.promises.access(targetPath)
        return true
    } catch {
        return false
    }
}

async function runGit(rootPath, args) {
    const { stdout } = await execFileAsync('git', args, { cwd: rootPath })

    return stdout.trim()
}

async function hasStagedChanges(rootPath) {
    try {
        await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: rootPath })

        return false
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 1) return true

        throw error
    }
}

async function commitStagedChanges(rootPath, message) {
    if (!await hasStagedChanges(rootPath)) return

    await runGit(rootPath, ['commit', '-m', message])
}

async function runCommand(project, command) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (typeof command !== 'string' || command.length === 0) throw new Error('Missing command text')

    try {
        const { stderr, stdout } = await execAsync(command, { cwd: rootPath })

        return { command, exitCode: 0, stderr, stdout }
    } catch (error) {
        if (!error || typeof error !== 'object') throw error

        return {
            command,
            exitCode: typeof error.code === 'number' ? error.code : 1,
            stderr: typeof error.stderr === 'string' ? error.stderr : '',
            stdout: typeof error.stdout === 'string' ? error.stdout : '',
        }
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

function requireScheduleObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid action schedule file: ${fieldName} must be an object`)

    return value
}

function requireScheduleString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid action schedule file: missing ${fieldName}`)

    return value
}

function normalizeScheduleStatus(value) {
    const status = requireScheduleString(value, 'status')
    if (!ACTION_SCHEDULE_STATUSES.includes(status)) throw new Error(`Invalid action schedule file: unsupported status ${status}`)

    return status
}

function normalizeScheduleContext(value) {
    const context = requireScheduleObject(value, 'context')
    const kind = requireScheduleString(context.kind, 'context.kind')
    if (!ACTION_CONTEXT_KINDS.includes(kind)) throw new Error(`Invalid action schedule file: unsupported context kind ${kind}`)

    const normalizedContext = { kind }
    for (const [key, contextValue] of Object.entries(context)) {
        if (key === 'kind') continue
        if (typeof contextValue !== 'string') throw new Error(`Invalid action schedule file: context.${key} must be a string`)

        normalizedContext[key] = contextValue
    }

    return normalizedContext
}

function normalizeScheduleTrigger(value) {
    const trigger = requireScheduleObject(value, 'trigger')
    const type = requireScheduleString(trigger.type, 'trigger.type')

    if (type === 'at') return { timestamp: requireScheduleString(trigger.timestamp, 'trigger.timestamp'), type }
    if (type === 'agentSlot') return { type }
    if (type === 'afterAction') return { actionName: requireScheduleString(trigger.actionName, 'trigger.actionName'), type }

    throw new Error(`Invalid action schedule file: unsupported trigger type ${type}`)
}

function normalizeActionSchedule(value) {
    const schedule = requireScheduleObject(value, 'schedule')

    return {
        actionName: requireScheduleString(schedule.actionName, 'actionName'),
        context: normalizeScheduleContext(schedule.context),
        createdAt: requireScheduleString(schedule.createdAt, 'createdAt'),
        id: requireScheduleString(schedule.id, 'id'),
        status: normalizeScheduleStatus(schedule.status),
        trigger: normalizeScheduleTrigger(schedule.trigger),
    }
}

function normalizeActionScheduleFile(value) {
    const file = requireScheduleObject(value, 'root')
    if (!Array.isArray(file.schedules)) throw new Error('Invalid action schedule file: schedules must be an array')

    return { schedules: file.schedules.map((schedule) => normalizeActionSchedule(schedule)) }
}

async function readActionScheduleFile(filePath) {
    if (!await pathExists(filePath)) return { schedules: [] }

    const content = await fs.promises.readFile(filePath, 'utf8')

    return normalizeActionScheduleFile(JSON.parse(content))
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
    const file = normalizeActionScheduleFile({ schedules })
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`)

    return file.schedules
}

async function cancelActionSchedule(project, actionsFolder, scheduleId) {
    if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id')

    const schedules = await loadActionSchedules(project, actionsFolder)
    const schedule = schedules.find((candidate) => candidate.id === scheduleId)
    if (!schedule) throw new Error(`Action schedule not found: ${scheduleId}`)
    if (schedule.status !== 'pending') throw new Error(`Cannot cancel action schedule with status ${schedule.status}`)

    const nextSchedules = schedules.map((candidate) => {
        if (candidate.id !== scheduleId) return candidate

        return { ...candidate, status: 'cancelled' }
    })

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

async function readMarkdownFiles(rootPath, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name)

        if (entry.isDirectory()) {
            files.push(...await readMarkdownFiles(rootPath, entryPath))
            continue
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
            const content = await fs.promises.readFile(entryPath, 'utf8')
            files.push({ content, path: normalizePath(path.relative(rootPath, entryPath)) })
        }
    }

    return files
}

async function readRootMarkdownFiles(rootPath, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
            const entryPath = path.join(folderPath, entry.name)
            const content = await fs.promises.readFile(entryPath, 'utf8')
            files.push({ content, path: normalizePath(path.relative(rootPath, entryPath)) })
        }
    }

    return files
}

async function readRepositoryFilePaths(rootPath, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        if (entry.name === GIT_FOLDER) continue

        const entryPath = path.join(folderPath, entry.name)

        if (entry.isDirectory()) {
            files.push(...await readRepositoryFilePaths(rootPath, entryPath))
            continue
        }

        if (entry.isFile()) files.push(normalizePath(path.relative(rootPath, entryPath)))
    }

    return files
}

async function readTopLevelFolders(rootPath) {
    const entries = await fs.promises.readdir(rootPath, { withFileTypes: true })

    return entries
        .filter((entry) => entry.isDirectory() && entry.name !== GIT_FOLDER)
        .map((entry) => ({ name: entry.name, path: normalizePath(entry.name) }))
        .sort((left, right) => left.path.localeCompare(right.path))
}

async function assertGitRoot(rootPath) {
    const gitPath = path.join(rootPath, '.git')

    if (!await pathExists(gitPath)) throw new Error('Selected folder must contain a .git directory')
}

function createMissingWorkingFolderError(workingFolder) {
    const error = new Error(`Working folder is missing: ${workingFolder}`)
    error.code = 'missing-working-folder'
    error.workingFolder = workingFolder

    return error
}

async function createProject(project, workingFolder) {
    return createWorkingFolderFromTemplate(project, workingFolder)
}

async function createWorkingFolderFromTemplate(project, workingFolder) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder))

    if (!await pathExists(workingFolderPath)) {
        await fs.promises.mkdir(workingFolderPath, { recursive: true })
        await fs.promises.writeFile(path.join(workingFolderPath, 'README.md'), '# MD2\n\nProject design folder created by MD2.\n')
        await runGit(rootPath, ['add', workingFolder])
        await commitStagedChanges(rootPath, `Create ${workingFolder} workspace`)
    }

    return project
}

async function loadProject(project, workingFolder) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder))

    if (!await pathExists(workingFolderPath)) {
        throw createMissingWorkingFolderError(workingFolder)
    }

    return {
        files: await readMarkdownFiles(rootPath, workingFolderPath),
        workingFolder,
    }
}

async function loadProjectRoot(project, workingFolder) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder))

    if (!await pathExists(workingFolderPath)) {
        throw createMissingWorkingFolderError(workingFolder)
    }

    return {
        files: await readRootMarkdownFiles(rootPath, workingFolderPath),
        workingFolder,
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

async function loadProjectConfig(project) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const configPath = ensureInsideRoot(rootPath, path.join(rootPath, PROJECT_CONFIG_PATH))
    if (!await pathExists(configPath)) return null

    const content = await fs.promises.readFile(configPath, 'utf8')

    return JSON.parse(content)
}

async function listBranches(project) {
    const rootPath = requireRootPath(project)
    const output = await runGit(rootPath, ['branch', '--format=%(refname:short)'])

    return output.split(/\r?\n/u).filter((name) => name.length > 0).map((name) => ({ name }))
}

async function listRepositoryFiles(project) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const files = await readRepositoryFilePaths(rootPath, rootPath)

    return files.sort((left, right) => left.localeCompare(right))
}

async function listTopLevelFolders(project) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)

    return readTopLevelFolders(rootPath)
}

async function checkoutBranch(project, branch) {
    const rootPath = requireRootPath(project)
    await runGit(rootPath, ['checkout', branch])

    return { ...project, branch }
}

async function commit(request, project) {
    const rootPath = requireRootPath(project)

    for (const file of request.files) {
        const filePath = ensureInsideRoot(rootPath, path.join(rootPath, file.path))
        const data = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await fs.promises.writeFile(filePath, data)
        await runGit(rootPath, ['add', file.path])
    }

    await commitStagedChanges(rootPath, request.message)
}

async function deleteFile(request, project) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (!request || typeof request.message !== 'string' || request.message.length === 0) throw new Error('Missing delete commit message')
    if (typeof request.path !== 'string' || request.path.length === 0) throw new Error('Missing delete file path')

    const filePath = ensureInsideRoot(rootPath, path.join(rootPath, request.path))
    const repositoryPath = normalizePath(path.relative(rootPath, filePath))
    await runGit(rootPath, ['rm', repositoryPath])
    await runGit(rootPath, ['commit', '-m', request.message])
}

async function moveFiles(request, project) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (!request || typeof request.message !== 'string' || request.message.length === 0) throw new Error('Missing move commit message')
    if (!Array.isArray(request.moves) || request.moves.length === 0) throw new Error('Missing files to move')

    for (const move of request.moves) {
        if (!move || typeof move.fromPath !== 'string' || move.fromPath.length === 0) throw new Error('Missing move source path')
        if (typeof move.toPath !== 'string' || move.toPath.length === 0) throw new Error('Missing move target path')

        const sourcePath = ensureInsideRoot(rootPath, path.join(rootPath, move.fromPath))
        const targetPath = ensureInsideRoot(rootPath, path.join(rootPath, move.toPath))
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
        await runGit(rootPath, ['mv', normalizePath(path.relative(rootPath, sourcePath)), normalizePath(path.relative(rootPath, targetPath))])
    }

    await runGit(rootPath, ['commit', '-m', request.message])
}

async function saveProjectConfig(project, config) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const configPath = ensureInsideRoot(rootPath, path.join(rootPath, PROJECT_CONFIG_PATH))
    await fs.promises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await runGit(rootPath, ['add', PROJECT_CONFIG_PATH])
    await commitStagedChanges(rootPath, 'Update MD2 project config')
}

async function push(project) {
    await runGit(requireRootPath(project), ['push'])
}

function watchProject(project, onChange) {
    const rootPath = requireRootPath(project)
    const watcher = fs.watch(rootPath, { recursive: true }, (_eventType, fileName) => {
        if (typeof fileName !== 'string') return

        const normalizedPath = normalizePath(fileName)
        const lowerPath = normalizedPath.toLowerCase()
        if (lowerPath.endsWith(MARKDOWN_EXTENSION) || lowerPath.endsWith(JSON_EXTENSION)) onChange({ path: normalizedPath })
    })

    return () => watcher.close()
}

module.exports = {
    assertGitRoot,
    checkoutBranch,
    commit,
    createProject,
    createWorkingFolderFromTemplate,
    deleteFile,
    listBranches,
    listRepositoryFiles,
    listTopLevelFolders,
    appendActionRunHistory,
    cancelActionSchedule,
    loadActionRunHistory,
    loadActionSchedules,
    loadAgentConversation,
    loadActionFiles,
    loadProject,
    loadProjectRoot,
    loadProjectConfig,
    moveFiles,
    push,
    runCommand,
    runAgent,
    runGit,
    saveActionSchedules,
    saveProjectConfig,
    watchProject,
}
