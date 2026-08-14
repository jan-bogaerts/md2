const crossSpawn = require('cross-spawn');

const CODEX_UPDATE_ARGUMENTS = ['install', '--global', '@openai/codex@latest'];
const CODEX_UPDATE_COMMAND = 'npm';
const MAX_PROCESS_OUTPUT_CHARACTERS = 64 * 1024;

function appendBoundedOutput(current, chunk) {
    return `${current}${chunk.toString()}`.slice(-MAX_PROCESS_OUTPUT_CHARACTERS);
}

function processErrorMessage(stderr, stdout, exitCode) {
    const output = stderr.trim() || stdout.trim();
    if (!output) return `npm exited with code ${exitCode}`;

    return output.split(/\r?\n/u).findLast((line) => line.trim().length > 0).trim();
}

/** Install latest Codex CLI through one fixed hidden npm command. */
function updateCodexCli(spawn = crossSpawn) {
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = spawn(CODEX_UPDATE_COMMAND, CODEX_UPDATE_ARGUMENTS, {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            reject(new Error(`Codex update failed: ${message}`, { cause: error }));
            return;
        }

        let settled = false;
        let stderr = '';
        let stdout = '';
        child.stdout.on('data', (chunk) => {
            stdout = appendBoundedOutput(stdout, chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr = appendBoundedOutput(stderr, chunk);
        });
        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            reject(new Error(`Codex update failed: ${error.message}`, { cause: error }));
        });
        child.on('close', (exitCode) => {
            if (settled) return;
            settled = true;
            if (exitCode === 0) {
                resolve({ stderr, stdout });
                return;
            }
            reject(new Error(`Codex update failed: ${processErrorMessage(stderr, stdout, exitCode)}`));
        });
    });
}

module.exports = { updateCodexCli };
