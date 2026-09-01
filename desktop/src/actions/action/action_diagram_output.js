const path = require('node:path');
const { ensureInsideRoot, requireRootPath } = require('../../git/git_commands');

const WINDOWS_RESERVED_FILE_NAME_PATTERN = /^(aux|com[1-9]|con|lpt[1-9]|nul|prn)(?:\.|$)/iu;
const WINDOWS_UNSAFE_CHARACTER_PATTERN = /[<>:"/\\|?*\s]+/gu;

function replaceControlCharacter(character) {
    return character.charCodeAt(0) < 32 ? '-' : character;
}

function sanitizeDiagramLabel(label) {
    if (typeof label !== 'string' || label.trim().length === 0) throw new Error('Diagram action label is required');
    const normalizedLabel = Array.from(label, replaceControlCharacter).join('');
    const sanitized = normalizedLabel.replace(WINDOWS_UNSAFE_CHARACTER_PATTERN, '-').replace(/^-+|-+$/gu, '');
    const safeLabel = sanitized.length > 0 ? sanitized : 'diagram';

    return WINDOWS_RESERVED_FILE_NAME_PATTERN.test(safeLabel) ? `diagram-${safeLabel}` : safeLabel;
}

function formatDiagramTimestamp(timestampMs) {
    return new Date(timestampMs).toISOString().replace(/[-:.]/gu, '');
}

function createDiagramPath(actionLabel, diagramsFolder, timestampMs) {
    if (typeof diagramsFolder !== 'string' || diagramsFolder.length === 0) throw new Error('Diagram output folder is required');
    const fileName = `${sanitizeDiagramLabel(actionLabel)}-${formatDiagramTimestamp(timestampMs)}.json`;

    return path.posix.join(diagramsFolder.replace(/\\/gu, '/'), fileName);
}

function resolveDiagramFile(runProject, diagramsFolder, diagramPath) {
    if (typeof diagramPath !== 'string' || path.extname(diagramPath).toLowerCase() !== '.json') {
        throw new Error('Diagram output path must identify a JSON file');
    }
    const repositoryRoot = requireRootPath(runProject);
    const outputFolder = ensureInsideRoot(repositoryRoot, path.resolve(repositoryRoot, diagramsFolder));
    const absolutePath = ensureInsideRoot(repositoryRoot, path.resolve(repositoryRoot, diagramPath));
    const relativeToOutputFolder = path.relative(outputFolder, absolutePath);
    if (relativeToOutputFolder.startsWith('..') || path.isAbsolute(relativeToOutputFolder)) {
        throw new Error('Diagram output path must stay inside the configured diagrams folder');
    }

    return absolutePath;
}

module.exports = { createDiagramPath, formatDiagramTimestamp, resolveDiagramFile, sanitizeDiagramLabel };
