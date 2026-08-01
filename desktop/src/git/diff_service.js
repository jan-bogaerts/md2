const { exec, spawn } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const { requireRootPath } = require('./git_commands');

const execAsync = promisify(exec);
const DIFF_PLACEHOLDER_PATTERN = /\{\{\s*(worktree-folder|project-folder|releases-folder|commit|branch|file)\s*\}\}/g;
const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DIFF_FILE_HEADER = 'diff --git ';
const OLD_PATH_HEADER = '--- ';
const NEW_PATH_HEADER = '+++ ';

/** Resolve an in-root file path, rejecting paths that escape the project root. */
function resolveInsideRoot(rootPath, targetPath) {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.resolve(resolvedRoot, targetPath);

    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error('Diff file path escapes project root');
    }

    return resolvedTarget;
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
        branch: request.branch,
        commit: request.commit,
        file: request.filePath,
        'project-folder': rootPath,
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

/** Build the validated `code -g` command that opens a diff file at a line inside the project. */
function buildEditorLaunch(rootPath, request) {
    if (!request || typeof request.path !== 'string' || request.path.length === 0) throw new Error('Missing editor file path');
    if (typeof request.line !== 'number' || !Number.isInteger(request.line) || request.line < 1) throw new Error('Invalid editor line number');

    const resolvedTarget = resolveInsideRoot(rootPath, request.path);

    return `code -g "${resolvedTarget}:${request.line}"`;
}

/** Open VS Code at the clicked diff file/line, rejecting paths that escape the project root. */
function openInEditor(project, request, spawnProcess = spawn) {
    const rootPath = requireRootPath(project);
    const command = buildEditorLaunch(rootPath, request);
    const child = spawnProcess(command, { cwd: rootPath, shell: true });

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
    openInEditor,
    parseUnifiedDiff,
    resolveDiffCommand,
};
