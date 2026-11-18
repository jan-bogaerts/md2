const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { createTwoFilesPatch } = require('diff');

const { requireRootPath } = require('./git_commands');
const {
    INVALID_LOCAL_FILE_LINK_ERROR,
    LOCAL_FILE_LINK_OUTSIDE_REPOSITORY_ERROR,
    localFileLinkError,
} = require('../../../shared/local_file_link_errors.mjs');

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_MAX_BUFFER_BYTES = 1024 * 1024 * 32;
const LITERAL_PATHSPEC_ARGUMENT = '--literal-pathspecs';
const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DIFF_FILE_HEADER = 'diff --git ';
const OLD_PATH_HEADER = '--- ';
const NEW_PATH_HEADER = '+++ ';
const FILE_URL_PATTERN = /^file:\/+/iu;
const NAME_STATUS_RENAME_PATTERN = /^[RC]\d+$/u;
const WORKTREE_PATCH_MAX_EDIT_LENGTH = 100_000;
const WORKTREE_PATCH_TIMEOUT_MS = 250;

function stripPathPrefix(rawPath) {
    if (rawPath.startsWith('a/') || rawPath.startsWith('b/')) return rawPath.slice(2);

    return rawPath;
}

function startDiffFile(headerLine) {
    const parts = headerLine.slice(DIFF_FILE_HEADER.length).trim().split(' ');
    const rawPath = parts[parts.length - 1];

    return { changeType: 'modified', newValue: [], oldValue: [], path: stripPathPrefix(rawPath) };
}

function finalizeDiffFile(file) {
    return {
        changeType: file.changeType,
        newValue: file.newValue.join('\n'),
        oldPath: file.oldPath,
        oldValue: file.oldValue.join('\n'),
        path: file.path,
    };
}

/** Parse unified diff text into per-file old/new sides carrying real file line numbers. */
function parseUnifiedDiff(text) {
    if (typeof text !== 'string' || text.trim().length === 0) throw new Error('Git diff produced no output');

    const files = [];
    let current = null;

    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith(DIFF_FILE_HEADER)) {
            if (current) files.push(finalizeDiffFile(current));
            current = startDiffFile(line);
            continue;
        }
        if (!current) continue;

        if (line.startsWith('new file mode ')) {
            current.changeType = 'added';
            continue;
        }
        if (line.startsWith('deleted file mode ')) {
            current.changeType = 'deleted';
            continue;
        }
        if (line.startsWith('rename from ')) {
            current.changeType = 'renamed';
            current.oldPath = line.slice('rename from '.length).trim();
            continue;
        }
        if (line.startsWith('rename to ')) {
            current.path = line.slice('rename to '.length).trim();
            continue;
        }
        if (line.startsWith(OLD_PATH_HEADER)) {
            const oldPath = stripPathPrefix(line.slice(OLD_PATH_HEADER.length).trim());
            if (oldPath !== '/dev/null') current.oldPath = oldPath;
            continue;
        }
        if (line.startsWith(NEW_PATH_HEADER)) {
            const newPath = stripPathPrefix(line.slice(NEW_PATH_HEADER.length).trim());
            if (newPath !== '/dev/null') current.path = newPath;
            continue;
        }

        const hunk = HUNK_HEADER_PATTERN.exec(line);
        if (hunk) continue;

        if (line.startsWith(' ')) {
            current.oldValue.push(line.slice(1));
            current.newValue.push(line.slice(1));
        } else if (line.startsWith('-')) {
            current.oldValue.push(line.slice(1));
        } else if (line.startsWith('+')) {
            current.newValue.push(line.slice(1));
        }
    }

    if (current) files.push(finalizeDiffFile(current));
    if (files.length === 0) throw new Error('Git diff output could not be parsed');

    return files;
}

/** Build fixed `git show` arguments; a file path limits the patch to that one repository path. */
function commitDiffArguments(commit, filePath) {
    const pathArguments = filePath === undefined ? [] : ['--', filePath];

    return [LITERAL_PATHSPEC_ARGUMENT, 'show', '--format=', '--find-renames', commit, ...pathArguments];
}

/** Run Git directly for one commit, optionally limited to one file, and return normalized diff data. */
async function generateDiff(project, request, runner = execFileAsync) {
    const rootPath = requireRootPath(project);
    if (!request || typeof request.commit !== 'string' || request.commit.length === 0) throw new Error('Missing diff commit hash');
    const { commit, filePath } = request;
    if (filePath !== undefined && (typeof filePath !== 'string' || filePath.length === 0)) throw new Error('Invalid diff file path');

    let stdout;
    try {
        ({ stdout } = await runner('git', commitDiffArguments(commit, filePath), {
            cwd: rootPath,
            maxBuffer: GIT_OUTPUT_MAX_BUFFER_BYTES,
            windowsHide: true,
        }));
    } catch (error) {
        const detail = error && typeof error.stderr === 'string' && error.stderr.length > 0 ? error.stderr : error?.message;
        throw new Error(`Git diff failed: ${detail ?? 'unknown error'}`);
    }

    return { commit, files: parseUnifiedDiff(stdout), patch: stdout };
}

function parseNullSeparatedValues(output) {
    if (typeof output !== 'string') throw new Error('Git path output must be a string');

    return output.split('\0').filter((value) => value.length > 0);
}

/** Parse `git diff --name-status -z` without losing paths containing whitespace. */
function parseNameStatus(output) {
    const values = parseNullSeparatedValues(output);
    const changes = [];
    for (let index = 0; index < values.length;) {
        const status = values[index++];
        if (!status) throw new Error('Git diff returned an empty file status');
        if (NAME_STATUS_RENAME_PATTERN.test(status)) {
            const oldPath = values[index++];
            const newPath = values[index++];
            if (!oldPath || !newPath) throw new Error(`Git diff returned incomplete ${status} metadata`);
            changes.push({ changeType: status.startsWith('R') ? 'renamed' : 'added', oldPath, path: newPath });
            continue;
        }

        const filePath = values[index++];
        if (!filePath) throw new Error(`Git diff returned no path for status ${status}`);
        const changeType = status === 'A' ? 'added' : status === 'D' ? 'deleted' : 'modified';
        changes.push({ changeType, path: filePath });
    }

    return changes;
}

function normalizeWorktreeFile(change, oldValue, newValue) {
    return {
        changeType: change.changeType,
        newValue,
        oldPath: change.oldPath,
        oldValue,
        path: change.path,
    };
}

function generateWorktreeFilePatch(file, createPatch) {
    const oldPath = file.oldPath ?? file.path;
    const oldHeaderPath = file.changeType === 'added' ? '/dev/null' : `a/${oldPath}`;
    const newHeaderPath = file.changeType === 'deleted' ? '/dev/null' : `b/${file.path}`;
    const patch = createPatch(oldHeaderPath, newHeaderPath, file.oldValue, file.newValue, undefined, undefined, {
        maxEditLength: WORKTREE_PATCH_MAX_EDIT_LENGTH,
        timeout: WORKTREE_PATCH_TIMEOUT_MS,
    });
    if (typeof patch !== 'string') throw new Error(`Worktree patch generation exceeded complexity bound: ${file.path}`);
    const renameMetadata = file.changeType === 'renamed'
        ? `rename from ${oldPath}\nrename to ${file.path}\n`
        : '';

    return `diff --git a/${oldPath} b/${file.path}\n${renameMetadata}${patch}`;
}

async function readWorktreeFile(worktreePath, filePath, readFileValue) {
    const targetPath = path.resolve(worktreePath, filePath);
    if (!isInsideRoot(targetPath, worktreePath)) throw new Error(`Worktree diff path escapes assigned worktree: ${filePath}`);

    return readFileValue(targetPath, 'utf8');
}

async function readRevisionFile(worktreePath, revision, filePath, runner) {
    const { stdout } = await runner('git', ['show', `${revision}:${filePath}`], {
        cwd: worktreePath,
        maxBuffer: GIT_OUTPUT_MAX_BUFFER_BYTES,
        windowsHide: true,
    });

    return stdout;
}

function requireWorktreeRequest(request, worktreeService) {
    if (!request || !Number.isInteger(request.worktree) || request.worktree <= 0) throw new Error('Missing worktree diff index');
    if (!worktreeService?.readDiffContext) throw new Error('Worktree diff service is unavailable');
}

/** Read changed-file metadata from name-status and untracked results without reading file contents. */
async function readWorktreeChanges(project, worktreeBranch, worktreeService) {
    const context = await worktreeService.readDiffContext(project, worktreeBranch);
    const changes = parseNameStatus(context.changes);
    const trackedPaths = new Set(changes.map(({ path: filePath }) => filePath));
    for (const filePath of parseNullSeparatedValues(context.untracked)) {
        if (!trackedPaths.has(filePath)) changes.push({ changeType: 'added', path: filePath });
    }

    return { changes, context };
}

/** List the changed files of one linked worktree; file contents stay unread. */
async function listWorktreeChanges(project, request, worktreeService) {
    requireWorktreeRequest(request, worktreeService);
    const { changes, context } = await readWorktreeChanges(project, request.worktreeBranch, worktreeService);

    return { files: changes, repositoryRoot: context.path, revision: crypto.randomUUID() };
}

/** Read and build the diff for one changed worktree path, using live metadata for its old path and change type. */
async function generateWorktreeFileDiff(project, request, worktreeService, dependencies = {}) {
    requireWorktreeRequest(request, worktreeService);
    if (typeof request.path !== 'string' || request.path.length === 0) throw new Error('Missing worktree diff file path');
    const readFileValue = dependencies.readFile ?? readFile;
    const createPatch = dependencies.createPatch ?? createTwoFilesPatch;
    const readRevisionFileValue = dependencies.readRevisionFile
        ?? ((worktreePath, revision, filePath) => readRevisionFile(worktreePath, revision, filePath, execFileAsync));

    const { changes, context } = await readWorktreeChanges(project, request.worktreeBranch, worktreeService);
    const change = changes.find(({ path: filePath }) => filePath === request.path);
    if (!change) throw new Error(`File is no longer changed in the linked worktree: ${request.path}`);
    const oldValue = change.changeType === 'added'
        ? ''
        : await readRevisionFileValue(context.path, context.baseCommit, change.oldPath ?? change.path);
    const newValue = change.changeType === 'deleted'
        ? ''
        : await readWorktreeFile(context.path, change.path, readFileValue);
    const file = normalizeWorktreeFile(change, oldValue, newValue);

    return { file, patch: generateWorktreeFilePatch(file, createPatch), repositoryRoot: context.path };
}

function pathKey(filePath) {
    return path.resolve(filePath).toLowerCase();
}

function isInsideRoot(targetPath, rootPath) {
    const relativePath = path.relative(path.resolve(rootPath), path.resolve(targetPath));

    return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath));
}

function decodeEditorPath(value) {
    try {
        const decoded = decodeURIComponent(value.trim());
        if (!FILE_URL_PATTERN.test(decoded)) return decoded;

        const filePath = decoded.replace(FILE_URL_PATTERN, '');

        return filePath.startsWith('/') && /^[a-z]:[\\/]/iu.test(filePath.slice(1)) ? filePath.slice(1) : filePath;
    } catch {
        throw localFileLinkError(INVALID_LOCAL_FILE_LINK_ERROR, `Invalid local file link: ${value}`);
    }
}

/** Split optional trailing `:line` from a local link. Explicit diff lines remain authoritative. */
function parseEditorTarget(request) {
    if (!request || typeof request.path !== 'string' || request.path.trim().length === 0) {
        throw localFileLinkError(INVALID_LOCAL_FILE_LINK_ERROR, 'Missing editor file path');
    }
    const decodedPath = decodeEditorPath(request.path);
    if (request.line !== undefined) {
        if (!Number.isInteger(request.line) || request.line < 1) throw new Error('Invalid editor line number');

        return { line: request.line, path: decodedPath };
    }

    const lastSeparator = Math.max(decodedPath.lastIndexOf('/'), decodedPath.lastIndexOf('\\'));
    const lastColon = decodedPath.lastIndexOf(':');
    if (lastColon <= lastSeparator || (lastColon === 1 && /^[a-z]:/iu.test(decodedPath))) return { line: 1, path: decodedPath };

    const lineText = decodedPath.slice(lastColon + 1);
    if (!/^\d+$/u.test(lineText) || Number(lineText) < 1) {
        throw localFileLinkError(INVALID_LOCAL_FILE_LINK_ERROR, `Invalid editor line suffix: ${decodedPath.slice(lastColon)}`);
    }

    return { line: Number(lineText), path: decodedPath.slice(0, lastColon) };
}

/** Substitute validated file and line values into global editor command. */
function buildEditorLaunch(editorCommand, filePath, line) {
    if (typeof editorCommand !== 'string' || editorCommand.length === 0) throw new Error('Missing editor command template');
    if (!editorCommand.includes('{{file}}')) throw new Error('Editor command template requires {{file}} placeholder');
    if (!Number.isInteger(line) || line < 1) throw new Error('Invalid editor line number');

    return editorCommand.replaceAll('{{file}}', filePath).replaceAll('{{line}}', String(line));
}

/** Resolve a local link against its active or registered repository root, without checking the file. */
function resolveLinkTarget(project, request, worktreeRoots) {
    const primaryRoot = requireRootPath(project);
    if (!request || typeof request.repositoryRoot !== 'string' || request.repositoryRoot.length === 0) {
        throw new Error('Missing editor execution repository root');
    }
    const allowedRoots = [primaryRoot, ...worktreeRoots].map((rootPath) => path.resolve(rootPath));
    const repositoryRoot = path.resolve(request.repositoryRoot);
    if (!allowedRoots.some((rootPath) => pathKey(rootPath) === pathKey(repositoryRoot))) {
        throw new Error('Editor execution repository is not active or registered');
    }

    const parsed = parseEditorTarget(request);
    const targetPath = path.resolve(repositoryRoot, parsed.path);
    const isInsideAllowedRoot = allowedRoots.some((rootPath) => isInsideRoot(targetPath, rootPath));

    return { isInsideAllowedRoot, line: parsed.line, repositoryRoot, targetPath };
}

async function requireRegularFile(targetPath, statFile) {
    let fileStats;
    try {
        fileStats = await statFile(targetPath);
    } catch {
        throw localFileLinkError(INVALID_LOCAL_FILE_LINK_ERROR, `Local file link target does not exist: ${targetPath}`);
    }
    if (!fileStats.isFile()) {
        throw localFileLinkError(INVALID_LOCAL_FILE_LINK_ERROR, `Local file link target is not a regular file: ${targetPath}`);
    }
}

async function resolveEditorTarget(project, request, worktreeRoots, statFile) {
    const target = resolveLinkTarget(project, request, worktreeRoots);
    if (!target.isInsideAllowedRoot) {
        throw localFileLinkError(
            LOCAL_FILE_LINK_OUTSIDE_REPOSITORY_ERROR,
            'Local file link points outside active repository and registered worktrees',
        );
    }
    await requireRegularFile(target.targetPath, statFile);

    return { filePath: target.targetPath, line: target.line, repositoryRoot: target.repositoryRoot };
}

/** Open an existing file outside the active repository and registered worktrees with the operating system. */
async function openWithSystemApplication(project, request, options) {
    const openPath = options?.openPath;
    if (typeof openPath !== 'function') throw new Error('Missing operating system open handler');
    const statFile = options?.statFile ?? stat;
    const worktreeRoots = options?.worktreeRoots ?? [];
    const target = resolveLinkTarget(project, request, worktreeRoots);
    if (target.isInsideAllowedRoot) throw new Error('Repository files open through the configured editor');
    await requireRegularFile(target.targetPath, statFile);

    const openError = await openPath(target.targetPath);
    if (openError) throw new Error(`Opening local file failed: ${openError}`);
}

/** Open validated local file through configured external editor. */
async function openInEditor(project, request, options) {
    const editorCommand = options?.editorCommand;
    const spawnProcess = options?.spawnProcess ?? spawn;
    const statFile = options?.statFile ?? stat;
    const worktreeRoots = options?.worktreeRoots ?? [];
    const target = await resolveEditorTarget(project, request, worktreeRoots, statFile);
    const command = buildEditorLaunch(editorCommand, target.filePath, target.line);
    const child = spawnProcess(command, { cwd: target.repositoryRoot, shell: true });

    return new Promise((resolve, reject) => {
        let isSettled = false;
        const settle = (handler, value) => {
            if (isSettled) return;

            isSettled = true;
            handler(value);
        };

        child.on('error', (error) => {
            const message = error instanceof Error ? error.message : 'unknown error';
            settle(reject, new Error(`Editor launch failed: ${message}`));
        });
        child.on('exit', (code) => {
            if (code === 0 || code === null) {
                settle(resolve);
                return;
            }

            settle(reject, new Error(`Editor launch failed with exit code ${code}`));
        });
    });
}

module.exports = {
    buildEditorLaunch,
    generateDiff,
    generateWorktreeFileDiff,
    listWorktreeChanges,
    openInEditor,
    openWithSystemApplication,
    parseNameStatus,
    parseUnifiedDiff,
    parseEditorTarget,
    resolveEditorTarget,
};
