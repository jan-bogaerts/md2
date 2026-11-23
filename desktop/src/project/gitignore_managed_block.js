const MANAGED_BLOCK_BEGIN = '# BEGIN MD² local-only project folder';
const MANAGED_BLOCK_END = '# END MD² local-only project folder';
const IGNORE_PATTERN_SPECIAL_CHARACTERS = /[\\*?[\]]/gu;

/** Root-anchored `.gitignore` entry that ignores one repository-relative folder. */
function projectFolderIgnoreEntry(projectFolder) {
    return `/${projectFolder.replace(IGNORE_PATTERN_SPECIAL_CHARACTERS, '\\$&')}/`;
}

/**
 * Returns `.gitignore` content whose MD²-managed block ignores `projectFolder`, or contains no block
 * when `projectFolder` is null. Every line outside the block and the file's newline style are kept.
 */
function updateManagedIgnoreBlock(content, projectFolder) {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/u);
    const beginIndex = lines.indexOf(MANAGED_BLOCK_BEGIN);
    const endIndex = beginIndex === -1 ? -1 : lines.indexOf(MANAGED_BLOCK_END, beginIndex);
    const blockLines = projectFolder === null
        ? []
        : [MANAGED_BLOCK_BEGIN, projectFolderIgnoreEntry(projectFolder), MANAGED_BLOCK_END];

    if (endIndex !== -1) {
        const nextLines = [...lines.slice(0, beginIndex), ...blockLines, ...lines.slice(endIndex + 1)];

        return nextLines.join(newline);
    }
    if (blockLines.length === 0) return content;

    const separator = content.length === 0 || content.endsWith('\n') ? '' : newline;

    return `${content}${separator}${blockLines.join(newline)}${newline}`;
}

module.exports = { MANAGED_BLOCK_BEGIN, MANAGED_BLOCK_END, projectFolderIgnoreEntry, updateManagedIgnoreBlock };
