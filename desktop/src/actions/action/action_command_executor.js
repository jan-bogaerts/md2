const { spawn } = require('node:child_process');
const { assertGitRoot, requireRootPath } = require('../../git/git_commands');
const { terminateProcessTree } = require('../process_tree');
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

async function waitForVisibleCommand(child, signal, terminate = terminateProcessTree) {
    return new Promise((resolve, reject) => {
        const handleAbort = () => {
            void terminate(child).catch(() => undefined);
        };
        signal.addEventListener('abort', handleAbort, { once: true });
        if (signal.aborted) handleAbort();
        child.on('error', (error) => {
            signal.removeEventListener('abort', handleAbort);
            if (signal.aborted) reject(new ActionCancellationError('Action cancelled'));
            else reject(error);
        });
        child.on('close', (exitCode) => {
            signal.removeEventListener('abort', handleAbort);
            if (signal.aborted) reject(new ActionCancellationError('Action cancelled'));
            else resolve(exitCode ?? 1);
        });
    });
}

/** Opens a separate Windows command window and resolves only after that window closes. */
async function runCommandInWindow(project, command, signal, _onOutput, dependencies = {}) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (signal.aborted) throw new ActionCancellationError('Action cancelled');

    const spawnCommand = dependencies.spawnCommand ?? spawn;
    const terminate = dependencies.terminateProcessTree ?? terminateProcessTree;
    const child = spawnCommand(command, {
        cwd: rootPath,
        detached: true,
        shell: true,
        stdio: 'inherit',
        windowsHide: false,
    });
    const exitCode = await waitForVisibleCommand(child, signal, terminate);

    return { command, exitCode, stderr: '', stdout: '' };
}

function executeCommandAction(input) {
    const command = resolvePlaceholders(
        input.command,
        input.context,
        input.project,
        input.primaryProject,
        input.projectFolder,
        input.releasesFolder,
        input.activeCardsFolder,
        '',
        input.diagramFile,
    );
    const onOutput = ({ stderr, stdout }) => input.onOutput({ command, stderr, stdout });

    const commandRunner = input.action.showCommandWindow ? input.commandWindowRunner : input.commandRunner;

    return commandRunner(input.project, command, input.signal, onOutput);
}

module.exports = { executeCommandAction, runCommand, runCommandInWindow };
