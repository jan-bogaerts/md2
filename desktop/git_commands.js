const { exec, execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

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

async function assertGitRoot(rootPath) {
    const gitPath = path.join(rootPath, '.git')

    if (!await pathExists(gitPath)) throw new Error('Selected folder must contain a .git directory')
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

async function push(project) {
    await runGit(requireRootPath(project), ['push'])
}

module.exports = {
    assertGitRoot,
    checkoutBranch,
    commitStagedChanges,
    ensureInsideRoot,
    hasStagedChanges,
    listBranches,
    push,
    requireRootPath,
    runCommand,
    runGit,
}
