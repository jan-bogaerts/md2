const { exec, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const DETACHED_HEAD_BRANCH = 'HEAD (detached)';
const trackedCommitQueues = new Map();

function requireRootPath(project) {
    if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) {
        throw new Error('Missing local Git project rootPath');
    }

    return project.rootPath;
}

function ensureInsideRoot(rootPath, targetPath) {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.resolve(targetPath);

    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error('Local Git path escapes project root');
    }

    return resolvedTarget;
}

async function pathExists(targetPath) {
    try {
        await fs.promises.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function runGit(rootPath, args) {
    const { stdout } = await execFileAsync('git', args, { cwd: rootPath });

    return stdout.trim();
}

async function readCurrentBranch(rootPath) {
    try {
        return await runGit(rootPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 1) return DETACHED_HEAD_BRANCH;

        throw error;
    }
}

function gitErrorMessage(error) {
    if (error && typeof error === 'object' && typeof error.stderr === 'string' && error.stderr.trim().length > 0) {
        return error.stderr.trim();
    }
    if (error instanceof Error) return error.message;

    return 'Unknown Git error';
}

/** Resolve a selected path to its Git work-tree root and checked-out branch. */
async function resolveLocalProject(selectedPath) {
    if (typeof selectedPath !== 'string' || selectedPath.length === 0) throw new Error('Missing selected project folder');

    try {
        const isInsideWorkTree = await runGit(selectedPath, ['rev-parse', '--is-inside-work-tree']);
        if (isInsideWorkTree !== 'true') throw new Error('Selected folder is not inside a Git work tree');

        const rootPath = path.resolve(await runGit(selectedPath, ['rev-parse', '--show-toplevel']));
        const branch = await readCurrentBranch(rootPath);

        return { branch, id: rootPath, rootPath };
    } catch (error) {
        throw new Error(`Local Git project validation failed for "${selectedPath}": ${gitErrorMessage(error)}`, { cause: error });
    }
}

async function hasStagedChanges(rootPath) {
    try {
        await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: rootPath });

        return false;
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 1) return true;

        throw error;
    }
}

async function commitStagedChanges(rootPath, message) {
    if (!await hasStagedChanges(rootPath)) return;

    await runGit(rootPath, ['commit', '-m', message]);
}

function normalizeTrackedPaths(rootPath, filePaths) {
    if (!Array.isArray(filePaths)) throw new Error('Missing tracked file paths');
    const resolvedRoot = path.resolve(rootPath);

    return [...new Set(filePaths.map((filePath) => {
        if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('Invalid tracked file path');
        const resolvedPath = ensureInsideRoot(resolvedRoot, path.resolve(resolvedRoot, filePath));
        const relativePath = path.relative(resolvedRoot, resolvedPath);
        if (relativePath.length === 0) throw new Error('Tracked file path must identify a file');

        return relativePath.replace(/\\/gu, '/');
    }))];
}

async function hasStagedPathChanges(rootPath, filePaths) {
    try {
        await execFileAsync('git', ['diff', '--cached', '--quiet', '--', ...filePaths], { cwd: rootPath });

        return false;
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 1) return true;

        throw error;
    }
}

async function commitTrackedPathsNow(rootPath, filePaths, message) {
    await runGit(rootPath, ['add', '--', ...filePaths]);
    if (!await hasStagedPathChanges(rootPath, filePaths)) return null;

    await runGit(rootPath, ['commit', '--only', '-m', message, '--', ...filePaths]);

    return runGit(rootPath, ['rev-parse', 'HEAD']);
}

/** Serialize a commit scoped to selected paths and return its hash, or null for no changes. */
function commitTrackedPaths(rootPath, filePaths, message) {
    if (typeof message !== 'string' || message.length === 0) throw new Error('Missing tracked commit message');
    const resolvedRoot = path.resolve(rootPath);
    const trackedPaths = normalizeTrackedPaths(resolvedRoot, filePaths);
    if (trackedPaths.length === 0) return Promise.resolve(null);
    const previousCommit = trackedCommitQueues.get(resolvedRoot) ?? Promise.resolve();
    const commit = previousCommit.then(() => commitTrackedPathsNow(resolvedRoot, trackedPaths, message));
    trackedCommitQueues.set(resolvedRoot, commit.catch(() => undefined));

    return commit;
}

async function assertGitRoot(rootPath) {
    const gitPath = path.join(rootPath, '.git');

    if (!await pathExists(gitPath)) throw new Error('Selected folder must contain a .git directory');
}

async function runCommand(project, command) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (typeof command !== 'string' || command.length === 0) throw new Error('Missing command text');

    try {
        const { stderr, stdout } = await execAsync(command, { cwd: rootPath });

        return { command, exitCode: 0, stderr, stdout };
    } catch (error) {
        if (!error || typeof error !== 'object') throw error;

        return {
            command,
            exitCode: typeof error.code === 'number' ? error.code : 1,
            stderr: typeof error.stderr === 'string' ? error.stderr : '',
            stdout: typeof error.stdout === 'string' ? error.stdout : '',
        };
    }
}

async function listBranches(project) {
    const rootPath = requireRootPath(project);
    const output = await runGit(rootPath, ['branch', '--format=%(refname:short)']);

    return output.split(/\r?\n/u).filter((name) => name.length > 0).map((name) => ({ name }));
}

async function checkoutBranch(project, branch) {
    const rootPath = requireRootPath(project);
    await runGit(rootPath, ['checkout', branch]);

    return { ...project, branch };
}

async function hasPendingPush(project) {
    const rootPath = requireRootPath(project);
    if (!project.branch) throw new Error('Missing project branch');

    const branchRef = `refs/heads/${project.branch}`;
    const upstream = await runGit(rootPath, ['for-each-ref', '--format=%(upstream)', branchRef]);
    const revisionRange = upstream.length > 0 ? `${upstream}..HEAD` : 'HEAD';
    const commitCount = await runGit(rootPath, ['rev-list', '--count', revisionRange]);

    return Number.parseInt(commitCount, 10) > 0;
}

async function push(project) {
    await runGit(requireRootPath(project), ['push']);
}

module.exports = {
    assertGitRoot,
    checkoutBranch,
    commitStagedChanges,
    commitTrackedPaths,
    ensureInsideRoot,
    hasStagedChanges,
    hasPendingPush,
    listBranches,
    pathExists,
    push,
    resolveLocalProject,
    requireRootPath,
    runCommand,
    runGit,
};
