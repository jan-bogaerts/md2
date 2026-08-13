const { exec, execFile, spawn } = require('node:child_process');
const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const { requireRootPath } = require('./git_commands');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const DIFF_PLACEHOLDER_NAMES = 'active-cards-folder|worktree-folder|repository-folder|project-folder|releases-folder|commit|branch|file';
const DIFF_PLACEHOLDER_PATTERN = new RegExp(`\\{\\{\\s*(${DIFF_PLACEHOLDER_NAMES})\\s*\\}\\}`, 'g');
const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DIFF_FILE_HEADER = 'diff --git ';
const OLD_PATH_HEADER = '--- ';
const NEW_PATH_HEADER = '+++ ';
const FILE_URL_PATTERN = /^file:\/+/iu;
const NAME_STATUS_RENAME_PATTERN = /^[RC]\d+$/u;

function resolveProjectFolder(rootPath, projectFolder) {
    if (typeof projectFolder !== 'string') return null;

    return projectFolder.length === 0 ? rootPath : path.resolve(rootPath, projectFolder);
}

/** Substitute the diff command placeholders, failing fast when a referenced value is missing. */
function resolveDiffCommand(template, values) {
    if (typeof template !== 'string' || template.length === 0) throw new Error('Missing diff command template');

    return template.replace(DIFF_PLACEHOLDER_PATTERN, (_match, name) => {
        const value = values[name];
        if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing diff command value: ${name}`);

        return value;
    });
}

function stripPathPrefix(rawPath) {
    if (rawPath.startsWith('a/') || rawPath.startsWith('b/')) return rawPath.slice(2);

    return rawPath;
}

function startDiffFile(headerLine) {
    const parts = headerLine.slice(DIFF_FILE_HEADER.length).trim().split(' ');
    const rawPath = parts[parts.length - 1];

    return { newLineNumbers: [], newValue: [], oldLineNumbers: [], oldValue: [], path: stripPathPrefix(rawPath) };
}

function finalizeDiffFile(file) {
    return {
        newLineNumbers: file.newLineNumbers,
        newValue: file.newValue.join('\n'),
        oldLineNumbers: file.oldLineNumbers,
        oldValue: file.oldValue.join('\n'),
        path: file.path,
    };
}

/** Parse unified diff text into per-file old/new sides carrying real file line numbers. */
function parseUnifiedDiff(text) {
    if (typeof text !== 'string' || text.trim().length === 0) throw new Error('Diff command produced no output');

    const files = [];
    let current = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith(DIFF_FILE_HEADER)) {
            if (current) files.push(finalizeDiffFile(current));
            current = startDiffFile(line);
            continue;
        }
        if (!current) continue;

        if (line.startsWith(OLD_PATH_HEADER)) continue;
        if (line.startsWith(NEW_PATH_HEADER)) {
            current.path = stripPathPrefix(line.slice(NEW_PATH_HEADER.length).trim());
            continue;
        }

        const hunk = HUNK_HEADER_PATTERN.exec(line);
        if (hunk) {
            oldLine = Number(hunk[1]);
            newLine = Number(hunk[2]);
            continue;
        }

        if (line.startsWith(' ')) {
            current.oldValue.push(line.slice(1));
            current.oldLineNumbers.push(oldLine++);
            current.newValue.push(line.slice(1));
            current.newLineNumbers.push(newLine++);
        } else if (line.startsWith('-')) {
            current.oldValue.push(line.slice(1));
            current.oldLineNumbers.push(oldLine++);
        } else if (line.startsWith('+')) {
            current.newValue.push(line.slice(1));
            current.newLineNumbers.push(newLine++);
        }
    }

    if (current) files.push(finalizeDiffFile(current));
    if (files.length === 0) throw new Error('Diff command output could not be parsed');

    return files;
}

/** Run the configured diff command for a commit and return normalized diff data. */
async function generateDiff(project, request, runner = execAsync) {
    const rootPath = requireRootPath(project);
    if (!request || typeof request.commit !== 'string' || request.commit.length === 0) throw new Error('Missing diff commit hash');

    const command = resolveDiffCommand(request.template, {
        'active-cards-folder': typeof request.workingFolder === 'string' && request.workingFolder.length > 0
            ? path.resolve(rootPath, request.workingFolder)
            : null,
        branch: request.branch,
        commit: request.commit,
        file: request.filePath,
        'project-folder': resolveProjectFolder(rootPath, request.projectFolder),
        'repository-folder': rootPath,
        'releases-folder': typeof request.releasesFolder === 'string' && request.releasesFolder.length > 0
            ? path.resolve(rootPath, request.releasesFolder)
            : null,
        'worktree-folder': rootPath,
    });

    let stdout;
    try {
        ({ stdout } = await runner(command, { cwd: rootPath, maxBuffer: 1024 * 1024 * 32 }));
    } catch (error) {
        const detail = error && typeof error.stderr === 'string' && error.stderr.length > 0 ? error.stderr : error?.message;
        throw new Error(`Diff command failed: ${detail ?? 'unknown error'}`);
    }

    return { commit: request.commit, files: parseUnifiedDiff(stdout) };
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

function lineNumbers(value) {
    if (value.length === 0) return [];

    return value.split(/\r?\n/u).map((_line, index) => index + 1);
}

function normalizeWorktreeFile(change, oldValue, newValue) {
    return {
        changeType: change.changeType,
        newLineNumbers: lineNumbers(newValue),
        newValue,
        oldLineNumbers: lineNumbers(oldValue),
        oldPath: change.oldPath,
        oldValue,
        path: change.path,
    };
}

async function readWorktreeFile(worktreePath, filePath, readFileValue) {
    const targetPath = path.resolve(worktreePath, filePath);
    if (!isInsideRoot(targetPath, worktreePath)) throw new Error(`Worktree diff path escapes assigned worktree: ${filePath}`);

    return readFileValue(targetPath, 'utf8');
}

async function readRevisionFile(worktreePath, revision, filePath, runner) {
    const { stdout } = await runner('git', ['show', `${revision}:${filePath}`], {
        cwd: worktreePath,
        maxBuffer: 1024 * 1024 * 32,
        windowsHide: true,
    });

    return stdout;
}

/** Generate normalized current-worktree data without staging or otherwise mutating Git state. */
async function generateWorktreeDiff(project, request, worktreeService, dependencies = {}) {
    if (!request || !Number.isInteger(request.worktree) || request.worktree <= 0) throw new Error('Missing worktree diff index');
    if (!worktreeService?.readDiffContext) throw new Error('Worktree diff service is unavailable');
    const readFileValue = dependencies.readFile ?? readFile;
    const readRevisionFileValue = dependencies.readRevisionFile
        ?? ((worktreePath, revision, filePath) => readRevisionFile(worktreePath, revision, filePath, execFileAsync));

    const context = await worktreeService.readDiffContext(project, request.worktree);
    const changes = parseNameStatus(context.changes);
    const trackedPaths = new Set(changes.map(({ path: filePath }) => filePath));
    for (const filePath of parseNullSeparatedValues(context.untracked)) {
        if (!trackedPaths.has(filePath)) changes.push({ changeType: 'added', path: filePath });
    }
    if (changes.length === 0) throw new Error('Linked worktree has no changes to view');

    const files = await Promise.all(changes.map(async (change) => {
        const oldPath = change.oldPath ?? change.path;
        const oldValue = change.changeType === 'added'
            ? ''
            : await readRevisionFileValue(context.path, context.baseCommit, oldPath);
        const newValue = change.changeType === 'deleted'
            ? ''
            : await readWorktreeFile(context.path, change.path, readFileValue);

        return normalizeWorktreeFile(change, oldValue, newValue);
    }));

    return { files, repositoryRoot: context.path };
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
        throw new Error(`Invalid local file link: ${value}`);
    }
}

/** Split optional trailing `:line` from a local link. Explicit diff lines remain authoritative. */
function parseEditorTarget(request) {
    if (!request || typeof request.path !== 'string' || request.path.trim().length === 0) throw new Error('Missing editor file path');
    const decodedPath = decodeEditorPath(request.path);
    if (request.line !== undefined) {
        if (!Number.isInteger(request.line) || request.line < 1) throw new Error('Invalid editor line number');

        return { line: request.line, path: decodedPath };
    }

    const lastSeparator = Math.max(decodedPath.lastIndexOf('/'), decodedPath.lastIndexOf('\\'));
    const lastColon = decodedPath.lastIndexOf(':');
    if (lastColon <= lastSeparator || (lastColon === 1 && /^[a-z]:/iu.test(decodedPath))) return { line: 1, path: decodedPath };

    const lineText = decodedPath.slice(lastColon + 1);
    if (!/^\d+$/u.test(lineText) || Number(lineText) < 1) throw new Error(`Invalid editor line suffix: ${decodedPath.slice(lastColon)}`);

    return { line: Number(lineText), path: decodedPath.slice(0, lastColon) };
}

/** Substitute validated file and line values into global editor command. */
function buildEditorLaunch(editorCommand, filePath, line) {
    if (typeof editorCommand !== 'string' || editorCommand.length === 0) throw new Error('Missing editor command template');
    if (!editorCommand.includes('{{file}}')) throw new Error('Editor command template requires {{file}} placeholder');
    if (!Number.isInteger(line) || line < 1) throw new Error('Invalid editor line number');

    return editorCommand.replaceAll('{{file}}', filePath).replaceAll('{{line}}', String(line));
}

async function resolveEditorTarget(project, request, worktreeRoots, statFile) {
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
    if (!allowedRoots.some((rootPath) => isInsideRoot(targetPath, rootPath))) {
        throw new Error('Local file link points outside active repository and registered worktrees');
    }

    let fileStats;
    try {
        fileStats = await statFile(targetPath);
    } catch {
        throw new Error(`Local file link target does not exist: ${targetPath}`);
    }
    if (!fileStats.isFile()) throw new Error(`Local file link target is not a regular file: ${targetPath}`);

    return { filePath: targetPath, line: parsed.line, repositoryRoot };
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
    generateWorktreeDiff,
    openInEditor,
    parseNameStatus,
    parseUnifiedDiff,
    parseEditorTarget,
    resolveEditorTarget,
    resolveDiffCommand,
};
