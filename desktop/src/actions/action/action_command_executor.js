const { spawn } = require('node:child_process');
const { assertGitRoot, requireRootPath } = require('../../git/git_commands');
const { ActionCancellationError } = require('./action_cancellation_error');
const { resolvePlaceholders } = require('./action_text');

async function runCommand(project, command, signal, onOutput, spawnCommand = spawn) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (signal.aborted) throw new ActionCancellationError('Action cancelled');

    return new Promise((resolve, reject) => {
        const child = spawnCommand(command, { cwd: rootPath, shell: true, signal });
        let stderr = '';
        let stdout = '';
        child.stdout.on('data', (chunk) => {
            const output = chunk.toString();
            stdout += output;
            onOutput({ stderr: '', stdout: output });
        });
        child.stderr.on('data', (chunk) => {
            const output = chunk.toString();
            stderr += output;
            onOutput({ stderr: output, stdout: '' });
        });
        child.on('error', (error) => {
            if (signal.aborted) reject(new ActionCancellationError('Action cancelled'));
            else reject(error);
        });
        child.on('close', (exitCode) => {
            if (signal.aborted) {
                reject(new ActionCancellationError('Action cancelled'));
                return;
            }

            resolve({ command, exitCode: exitCode ?? 1, stderr, stdout });
        });
    });
}

function executeCommandAction(input) {
    const command = resolvePlaceholders(
        input.action.command,
        input.context,
        input.project,
        input.primaryProject,
        input.projectFolder,
        input.releasesFolder,
        input.activeCardsFolder,
        input.extraPrompt,
    );
    const onOutput = ({ stderr, stdout }) => input.onOutput({ command, stderr, stdout });

    return input.commandRunner(input.project, command, input.signal, onOutput);
}

module.exports = { executeCommandAction, runCommand };
