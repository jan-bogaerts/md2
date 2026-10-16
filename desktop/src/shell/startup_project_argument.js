const path = require('node:path');

const PACKAGED_SKIPPED_ARGUMENT_COUNT = 1;
const DEVELOPMENT_SKIPPED_ARGUMENT_COUNT = 2;

/**
 * Read the project folder passed on the command line.
 * Skips the executable (and the app path in development) and Chromium switches.
 * Returns an absolute path or null; no filesystem or Git validation happens here.
 */
function readStartupProjectPath(argv, isPackaged) {
    const skippedCount = isPackaged ? PACKAGED_SKIPPED_ARGUMENT_COUNT : DEVELOPMENT_SKIPPED_ARGUMENT_COUNT;
    const projectArgument = argv.slice(skippedCount).find((argument) => !argument.startsWith('-'));

    return projectArgument ? path.resolve(projectArgument) : null;
}

module.exports = { readStartupProjectPath };
