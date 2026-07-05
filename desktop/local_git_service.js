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

async function readJsonArray(filePath) {
    if (!await pathExists(filePath)) return []

    const content = await fs.promises.readFile(filePath, 'utf8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) throw new Error('Action history file must contain an array')

    return parsed
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

async function runAgent(project, request) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    if (!request || typeof request.command !== 'string' || request.command.length === 0) throw new Error('Missing agent command')
    if (typeof request.prompt !== 'string' || request.prompt.length === 0) throw new Error('Missing agent prompt')

    const { exitCode, stderr, stdout } = await runProcessWithInput(request.command, request.prompt, rootPath)

    return { command: request.command, exitCode, prompt: request.prompt, stderr, stdout }
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

async function assertGitRoot(rootPath) {
    const gitPath = path.join(rootPath, '.git')

    if (!await pathExists(gitPath)) throw new Error('Selected folder must contain a .git directory')
}

async function createProject(project, workingFolder) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder))

    if (!await pathExists(workingFolderPath)) {
        await fs.promises.mkdir(workingFolderPath, { recursive: true })
        await fs.promises.writeFile(path.join(workingFolderPath, 'README.md'), '# MD2\n\nProject design folder created by MD2.\n')
        await runGit(rootPath, ['add', workingFolder])
        await runGit(rootPath, ['commit', '-m', `Create ${workingFolder} workspace`])
    }

    return project
}

async function loadProject(project, workingFolder) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder))

    if (!await pathExists(workingFolderPath)) {
        await fs.promises.mkdir(workingFolderPath, { recursive: true })
        await fs.promises.writeFile(path.join(workingFolderPath, 'README.md'), '# MD2\n\nProject design folder created by MD2.\n')
    }

    return {
        files: await readMarkdownFiles(rootPath, workingFolderPath),
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
        if (entry.isFile() && entry.name.toLowerCase().endsWith(JSON_EXTENSION)) {
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

async function checkoutBranch(project, branch) {
    const rootPath = requireRootPath(project)
    await runGit(rootPath, ['checkout', branch])

    return { ...project, branch }
}

async function commit(request, project) {
    const rootPath = requireRootPath(project)

    for (const file of request.files) {
        const filePath = ensureInsideRoot(rootPath, path.join(rootPath, file.path))
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await fs.promises.writeFile(filePath, file.content)
        await runGit(rootPath, ['add', file.path])
    }

    await runGit(rootPath, ['commit', '-m', request.message])
}

async function saveProjectConfig(project, config) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)
    const configPath = ensureInsideRoot(rootPath, path.join(rootPath, PROJECT_CONFIG_PATH))
    await fs.promises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await runGit(rootPath, ['add', PROJECT_CONFIG_PATH])
    await runGit(rootPath, ['commit', '-m', 'Update MD2 project config'])
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
    listBranches,
    appendActionRunHistory,
    loadActionRunHistory,
    loadActionFiles,
    loadProject,
    loadProjectConfig,
    push,
    runCommand,
    runAgent,
    runGit,
    saveProjectConfig,
    watchProject,
}
