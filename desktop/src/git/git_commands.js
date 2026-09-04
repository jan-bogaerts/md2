const { exec } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const execAsync = promisify(exec);
const { describeGitIndexLock } = require('./git_lock_diagnostics');
const { withGitIndexMutation } = require('./git_index_coordinator');
const { GitProcess, formatGitCommand, gitTimeoutPolicy } = require('./git_process');
const DETACHED_HEAD_BRANCH = 'HEAD (detached)';
const LITERAL_PATHSPEC_ARGUMENT = '--literal-pathspecs';
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/iu;
const GIT_INDEX_LOCK_PATTERN = /(?:unable to create|index\.lock).*index\.lock|another git process seems to be running/iu;
const GIT_INDEX_LOCK_RETRY_DELAYS_MS = [50, 100, 200, 400];
const LIST_WORKING_TREE_FILES_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const SHORT_STAT_PATTERNS = {
    deletions: /(\d+) deletions?\(-\)/u,
    filesChanged: /(\d+) files? changed/u,
    insertions: /(\d+) insertions?\(\+\)/u,
};

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

function executeGit(rootPath, args, options = {}) {
    const policy = gitTimeoutPolicy(args);
    const process = new GitProcess({
        args,
        maxBuffer: options.maxBuffer,
        operation: options.operation ?? policy.operation,
        rootPath,
        timeoutMs: options.timeoutMs ?? policy.timeoutMs,
    });

    return process.run();
}

function isGitIndexLockError(error) {
    if (!error || typeof error !== 'object') return false;
    const output = `${typeof error.stderr === 'string' ? error.stderr : ''}\n${error.message ?? ''}`;

    return GIT_INDEX_LOCK_PATTERN.test(output);
}

function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

function isSpawnEnoentError(error) {
    return !!error && typeof error === 'object' && error.code === 'ENOENT' && error.syscall !== undefined
        && String(error.syscall).includes('spawn');
}

/**
 * Node rejects with `spawn git ENOENT` both when Git is absent and when the working directory it was handed does
 * not exist. The second case is the common one for a worktree folder that was deleted outside md2, so name it.
 */
async function describeSpawnEnoent(rootPath, args, error) {
    if (await pathExists(rootPath)) return error;

    return new Error(
        `Git working directory does not exist: ${rootPath} (command: ${formatGitCommand(args)})`,
        { cause: error },
    );
}

async function runGit(rootPath, args) {
    try {
        return await runGitWithIndexLockRetries(rootPath, args);
    } catch (error) {
        if (!isSpawnEnoentError(error)) throw error;

        throw await describeSpawnEnoent(rootPath, args, error);
    }
}

async function runGitWithIndexLockRetries(rootPath, args) {
    for (const [retryIndex, retryDelay] of GIT_INDEX_LOCK_RETRY_DELAYS_MS.entries()) {
        try {
            const { stdout } = await executeGit(rootPath, args);

            return stdout.trim();
        } catch (error) {
            if (!isGitIndexLockError(error)) throw error;
            console.warn('[git:index-lock-retry]', {
                args,
                cwd: rootPath,
                delayMs: retryDelay,
                retry: retryIndex + 1,
            });
            await delay(retryDelay);
        }
    }

    try {
        const { stdout } = await executeGit(rootPath, args);

        return stdout.trim();
    } catch (error) {
        if (!isGitIndexLockError(error)) throw error;
        const diagnostics = await describeGitIndexLock(rootPath);
        throw new Error(`${gitErrorMessage(error)}\n${diagnostics}`, { cause: error });
    }
}

function parseNullSeparatedPaths(output) {
    return output.split('\0').filter((filePath) => filePath.length > 0);
}

/** List tracked and nonignored untracked files that still exist in the Git working tree. */
async function listWorkingTreeFiles(rootPath) {
    const { stdout } = await executeGit(
        rootPath,
        ['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate', '-z'],
        { maxBuffer: LIST_WORKING_TREE_FILES_MAX_BUFFER_BYTES, operation: 'desktop Git list working-tree files' },
    );
    const { stdout: deletedOutput } = await executeGit(
        rootPath,
        ['ls-files', '--deleted', '-z'],
        { maxBuffer: LIST_WORKING_TREE_FILES_MAX_BUFFER_BYTES, operation: 'desktop Git list deleted working-tree files' },
    );
    const deletedPaths = new Set(parseNullSeparatedPaths(deletedOutput));

    return parseNullSeparatedPaths(stdout).filter((filePath) => !deletedPaths.has(filePath));
}

/** Parse Git short-stat output, where omitted categories mean zero. */
function parseShortStat(output) {
    if (typeof output !== 'string') throw new Error('Git short-stat output must be a string');

    return Object.fromEntries(Object.entries(SHORT_STAT_PATTERNS).map(([field, pattern]) => {
        const match = output.match(pattern);

        return [field, match ? Number.parseInt(match[1], 10) : 0];
    }));
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
        await runGit(rootPath, ['diff', '--cached', '--quiet']);

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
        await runGit(rootPath, [LITERAL_PATHSPEC_ARGUMENT, 'diff', '--cached', '--quiet', '--', ...filePaths]);

        return false;
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 1) return true;

        throw error;
    }
}

async function commitTrackedPathsNow(rootPath, filePaths, message) {
    await runGit(rootPath, [LITERAL_PATHSPEC_ARGUMENT, 'add', '--', ...filePaths]);
    if (!await hasStagedPathChanges(rootPath, filePaths)) return null;

    await runGit(rootPath, [LITERAL_PATHSPEC_ARGUMENT, 'commit', '--only', '-m', message, '--', ...filePaths]);

    return runGit(rootPath, ['rev-parse', 'HEAD']);
}

/** Serialize a commit scoped to selected paths and return its hash, or null for no changes/cancellation. */
function commitTrackedPaths(rootPath, filePaths, message, signal) {
    if (typeof message !== 'string' || message.length === 0) throw new Error('Missing tracked commit message');
    const resolvedRoot = path.resolve(rootPath);
    const trackedPaths = normalizeTrackedPaths(resolvedRoot, filePaths);
    if (trackedPaths.length === 0) return Promise.resolve(null);
    return withGitIndexMutation(resolvedRoot, () => (
        signal?.aborted ? null : commitTrackedPathsNow(resolvedRoot, trackedPaths, message)
    ));
}

/** Resolve stable metadata required to retain and display one commit reference. */
async function resolveCommitMetadata(rootPath, commit) {
    if (typeof commit !== 'string' || commit.length === 0) throw new Error('Missing commit hash');
    const resolvedRoot = path.resolve(rootPath);
    const fullCommit = await runGit(resolvedRoot, ['rev-parse', `${commit}^{commit}`]);
    const committedAt = await runGit(resolvedRoot, ['show', '-s', '--format=%cI', fullCommit]);
    const changedPathsOutput = await runGit(resolvedRoot, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', fullCommit]);
    const filePaths = changedPathsOutput.split(/\r?\n/u).filter((filePath) => filePath.length > 0);
    const parents = (await runGit(resolvedRoot, ['rev-list', '--parents', '-n', '1', fullCommit])).split(/\s+/u);
    const shortStatOutput = parents.length === 1
        ? await runGit(resolvedRoot, ['diff-tree', '--root', '--shortstat', '--no-commit-id', '-r', fullCommit])
        : await runGit(resolvedRoot, ['diff', '--shortstat', `${fullCommit}^`, fullCommit]);
    const { deletions, filesChanged, insertions } = parseShortStat(shortStatOutput);

    if (committedAt.length === 0) throw new Error(`Git returned no timestamp for commit ${fullCommit}`);

    return { commit: fullCommit, committedAt, deletions, filePaths, filesChanged, insertions };
}

function repositoryRelativePath(rootPath, filePath) {
    if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('Missing repository file path');
    const resolvedRoot = path.resolve(rootPath);
    const resolvedPath = ensureInsideRoot(resolvedRoot, path.resolve(resolvedRoot, filePath));
    const relativePath = path.relative(resolvedRoot, resolvedPath).replace(/\\/gu, '/');
    if (relativePath.length === 0) throw new Error('Repository file path must identify a file');

    return relativePath;
}

async function commitExists(rootPath, commit) {
    if (typeof commit !== 'string' || commit.length === 0) throw new Error('Missing commit hash');
    try {
        await runGit(rootPath, ['cat-file', '-e', `${commit}^{commit}`]);

        return true;
    } catch (error) {
        if (error && typeof error === 'object' && typeof error.code === 'number') return false;

        throw error;
    }
}

async function isCommitAncestor(rootPath, commit, descendant = 'HEAD') {
    try {
        await runGit(rootPath, ['merge-base', '--is-ancestor', commit, descendant]);

        return true;
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 1) return false;

        throw error;
    }
}

async function readFileAtCommit(project, request) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!request || typeof request.commit !== 'string' || !FULL_COMMIT_PATTERN.test(request.commit)) throw new Error('Invalid historical file commit');
    if (typeof request.parent !== 'boolean') throw new Error('Missing historical file parent flag');
    const filePath = repositoryRelativePath(rootPath, request.path);
    if (!await commitExists(rootPath, request.commit)) throw new Error('Commit is no longer available in this repository');
    let revision = request.commit;
    if (request.parent) {
        const commitLine = await runGit(rootPath, ['rev-list', '--parents', '-n', '1', request.commit]);
        if (commitLine.split(/\s+/u).length === 1) return { content: '', exists: false };
        revision = `${request.commit}^`;
    }
    try {
        await runGit(rootPath, ['cat-file', '-e', `${revision}:${filePath}`]);
    } catch (error) {
        if (error && typeof error === 'object' && typeof error.code === 'number') return { content: '', exists: false };
        throw error;
    }

    const { stdout } = await executeGit(rootPath, ['show', `${revision}:${filePath}`], {
        maxBuffer: 1024 * 1024 * 32,
        operation: 'desktop Git read historical file',
    });

    return { content: stdout, exists: true };
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
        console.log('[command]', { command, cwd: rootPath });
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
    await withGitIndexMutation(rootPath, () => runGit(rootPath, ['checkout', branch]));

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
    commitExists,
    commitStagedChanges,
    commitTrackedPaths,
    ensureInsideRoot,
    hasStagedChanges,
    hasPendingPush,
    isCommitAncestor,
    isGitIndexLockError,
    listBranches,
    listWorkingTreeFiles,
    pathExists,
    parseShortStat,
    push,
    readFileAtCommit,
    resolveCommitMetadata,
    resolveLocalProject,
    requireRootPath,
    runCommand,
    runGit,
};
