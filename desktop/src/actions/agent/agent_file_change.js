/** Count lines in complete file content without treating a terminal newline as another line. */
function countFileContentLines(content) {
    if (typeof content !== 'string') return null;
    if (content.length === 0) return 0;

    const lines = content.replace(/\r\n/gu, '\n').split('\n');

    return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function fileContentLines(content) {
    if (typeof content !== 'string') return null;
    if (content.length === 0) return [];

    const lines = content.replace(/\r\n/gu, '\n').split('\n');
    if (lines.at(-1) === '') lines.pop();

    return lines;
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

/** Return smallest whole-line insertion/deletion counts using a longest common subsequence. */
function countLineChanges(oldContent, newContent) {
    const oldLines = fileContentLines(oldContent);
    const newLines = fileContentLines(newContent);
    if (!oldLines || !newLines) return null;

    let previousLengths = new Array(newLines.length + 1).fill(0);
    for (const oldLine of oldLines) {
        const currentLengths = new Array(newLines.length + 1).fill(0);
        for (const [index, newLine] of newLines.entries()) {
            currentLengths[index + 1] = oldLine === newLine
                ? previousLengths[index] + 1
                : Math.max(previousLengths[index + 1], currentLengths[index]);
        }
        previousLengths = currentLengths;
    }
    const unchangedLines = previousLengths.at(-1);

    return {
        deletions: oldLines.length - unchangedLines,
        insertions: newLines.length - unchangedLines,
    };
}

module.exports = { countFileContentLines, countLineChanges, countPatchLines };
