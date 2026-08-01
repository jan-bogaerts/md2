const path = require('node:path');
const { normalizePath } = require('../../../../shared/path_utils.mjs');

/**
 * Turn a provider-reported file path into a repo-relative POSIX pathspec, or null when the path
 * escapes the project root. Changed paths end up as `git add` arguments, so they must be relative,
 * slash-normalized (otherwise the same file arrives twice and dedupe fails) and root-confined
 * (otherwise a file the agent touched outside the repo would be pulled into a card commit).
 */
function normalizeChangedPath(rootPath, filePath) {
    if (typeof filePath !== 'string' || filePath.length === 0) return null;
    const resolvedRoot = path.resolve(rootPath);
    const resolvedPath = path.resolve(resolvedRoot, filePath);
    const relativePath = path.relative(resolvedRoot, resolvedPath);
    if (relativePath.length === 0 || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return null;

    return normalizePath(relativePath);
}

function normalizeChangedPaths(rootPath, filePaths) {
    return [...new Set(filePaths
        .map((filePath) => normalizeChangedPath(rootPath, filePath))
        .filter((filePath) => filePath !== null))];
}

/** Render a transcript payload as text; objects are serialized, empty values become null. */
function normalizedContent(value) {
    if (value === undefined || value === null) return null;
    const content = typeof value === 'string' ? value : JSON.stringify(value);

    return content.length > 0 ? content : null;
}

/** Split a stdout stream into complete JSON lines, holding the trailing partial line back. */
class JsonLineBuffer {
    constructor(label, onLine) {
        this.buffer = '';
        this.label = label;
        this.onLine = onLine;
    }

    push(chunk) {
        this.buffer += chunk.toString();
        const lines = this.buffer.split(/\r?\n/u);
        this.buffer = lines.pop() ?? '';
        for (const line of lines) this.emit(line);
    }

    finish() {
        if (this.buffer.length > 0) this.emit(this.buffer);
        this.buffer = '';
    }

    emit(line) {
        if (line.trim().length === 0) return;

        console.log('[agent:raw]', this.label, line);
        this.onLine(line);
    }
}

module.exports = { JsonLineBuffer, normalizeChangedPath, normalizeChangedPaths, normalizedContent };
