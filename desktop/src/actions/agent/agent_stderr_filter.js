const HIDDEN_STDERR_LINES = [
    /^completed$/i,
    /^Debugger listening on ws:\/\//,
    /^For help, see: https:\/\/nodejs\.org\/en\/docs\/inspector\/?$/,
    /^Debugger attached\.$/,
    /^Reading additional input from stdin\.\.\.$/,
    /^Waiting for the debugger to disconnect\.\.\.$/,
];

const ESCAPE_CHARACTER = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, 'gu');

/** Remove terminal formatting that cannot be represented in application text. */
function stripAnsi(value) {
    return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function isHiddenStderrLine(line) {
    return HIDDEN_STDERR_LINES.some((pattern) => pattern.test(stripAnsi(line).trim()));
}

/** Drops hidden lines from the complete lines in `content`; the trailing partial line is returned as `remainder`. */
function filterCompleteStderrLines(content) {
    const parts = content.split(/(\r\n|\r|\n)/);
    const remainder = parts.pop();
    const visibleParts = [];
    for (let index = 0; index < parts.length; index += 2) {
        const line = stripAnsi(parts[index]);
        const delimiter = parts[index + 1];
        if (!isHiddenStderrLine(line)) visibleParts.push(`${line}${delimiter}`);
    }

    return { content: visibleParts.join(''), remainder };
}

module.exports = { HIDDEN_STDERR_LINES, filterCompleteStderrLines, isHiddenStderrLine, stripAnsi };
