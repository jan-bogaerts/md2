/** Count lines in complete file content without treating a terminal newline as another line. */
function countFileContentLines(content) {
    if (typeof content !== 'string') return null;
    if (content.length === 0) return 0;

    const lines = content.replace(/\r\n/gu, '\n').split('\n');

    return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

/** Count validated patch content lines. Context and no-newline markers contribute no changes. */
function countPatchLines(lines) {
    if (!Array.isArray(lines)) return null;

    let deletions = 0;
    let insertions = 0;
    for (const line of lines) {
        if (typeof line !== 'string') return null;
        if (line === '\\ No newline at end of file' || line.startsWith(' ')) continue;
        if (line.startsWith('+')) {
            insertions += 1;
            continue;
        }
        if (line.startsWith('-')) {
            deletions += 1;
            continue;
        }

        return null;
    }

    return { deletions, insertions };
}

module.exports = { countFileContentLines, countPatchLines };
