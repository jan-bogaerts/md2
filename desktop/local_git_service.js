const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const MARKDOWN_EXTENSION = '.md'
const JSON_EXTENSION = '.json'
const PROJECT_CONFIG_PATH = 'md2.config.json'

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
        if (typeof fileName === 'string' && fileName.toLowerCase().endsWith(MARKDOWN_EXTENSION)) onChange()
    })

    return () => watcher.close()
}

module.exports = {
    assertGitRoot,
    checkoutBranch,
    commit,
    createProject,
    listBranches,
    loadActionFiles,
    loadProject,
    loadProjectConfig,
    push,
    runGit,
    saveProjectConfig,
    watchProject,
}
