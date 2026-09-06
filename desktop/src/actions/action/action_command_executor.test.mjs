import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionCancellationError } = require('./action_cancellation_error');
const { executeCommandAction, runCommand, runCommandInWindow } = require('./action_command_executor');

const temporaryPaths = [];

async function createGitProject() {
    const rootPath = await mkdtemp(join(tmpdir(), 'md2-command-executor-'));
    temporaryPaths.push(rootPath);
    await mkdir(join(rootPath, '.git'));

    return { rootPath };
}

function createChild() {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout = new EventEmitter();

    return child;
}

afterEach(async () => {
    for (const temporaryPath of temporaryPaths.splice(0)) await rm(temporaryPath, { force: true, recursive: true });
});

describe('runCommand', () => {
    it('asserts Git root before spawning', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-command-executor-'));
        temporaryPaths.push(rootPath);
        const spawnCommand = vi.fn();

        await expect(runCommand({ rootPath }, 'echo test', new AbortController().signal, vi.fn(), spawnCommand))
            .rejects.toThrow('Selected folder must contain a .git directory');
        expect(spawnCommand).not.toHaveBeenCalled();
    });

    it('streams and buffers stdout and stderr', async () => {
        const project = await createGitProject();
        const child = createChild();
        const onOutput = vi.fn();
        const completion = runCommand(project, 'echo test', new AbortController().signal, onOutput, () => child);
        await vi.waitFor(() => expect(child.listenerCount('close')).toBe(1));
        child.stdout.emit('data', Buffer.from('out'));
        child.stderr.emit('data', Buffer.from('err'));
        child.emit('close', 0);

        await expect(completion).resolves.toEqual({ command: 'echo test', exitCode: 0, stderr: 'err', stdout: 'out' });
        expect(onOutput.mock.calls.map(([output]) => output)).toEqual([
            { stderr: '', stdout: 'out' },
            { stderr: 'err', stdout: '' },
        ]);
    });

    it.each([[2, 2], [null, 1]])('preserves exit code %s as %s', async (exitCode, expectedExitCode) => {
        const project = await createGitProject();
        const child = createChild();
        const completion = runCommand(project, 'command', new AbortController().signal, vi.fn(), () => child);
        await vi.waitFor(() => expect(child.listenerCount('close')).toBe(1));
        child.emit('close', exitCode);

        await expect(completion).resolves.toMatchObject({ exitCode: expectedExitCode });
    });

    it('propagates spawn errors', async () => {
        const project = await createGitProject();
        const child = createChild();
        const completion = runCommand(project, 'command', new AbortController().signal, vi.fn(), () => child);
        await vi.waitFor(() => expect(child.listenerCount('error')).toBe(1));
        child.emit('error', new Error('spawn failed'));

        await expect(completion).rejects.toThrow('spawn failed');
    });

    it('maps abort before spawn to cancellation', async () => {
        const project = await createGitProject();
        const controller = new AbortController();
        const spawnCommand = vi.fn();
        controller.abort();

        await expect(runCommand(project, 'command', controller.signal, vi.fn(), spawnCommand))
            .rejects.toBeInstanceOf(ActionCancellationError);
        expect(spawnCommand).not.toHaveBeenCalled();
    });

    it('maps abort during execution to cancellation', async () => {
        const project = await createGitProject();
        const controller = new AbortController();
        const child = createChild();
        const completion = runCommand(project, 'command', controller.signal, vi.fn(), () => child);
        await vi.waitFor(() => expect(child.listenerCount('close')).toBe(1));
        controller.abort();
        child.emit('close', 0);

        await expect(completion).rejects.toBeInstanceOf(ActionCancellationError);
    });

    it('maps spawn error after abort to cancellation', async () => {
        const project = await createGitProject();
        const controller = new AbortController();
        const child = createChild();
        const completion = runCommand(project, 'command', controller.signal, vi.fn(), () => child);
        await vi.waitFor(() => expect(child.listenerCount('error')).toBe(1));
        controller.abort();
        child.emit('error', new Error('aborted by process'));

        await expect(completion).rejects.toBeInstanceOf(ActionCancellationError);
    });
});

describe('runCommandInWindow', () => {
    it('waits for the visible launcher without capturing output', async () => {
        const project = await createGitProject();
        const child = createChild();
        const onOutput = vi.fn();
        const spawnCommand = vi.fn(() => child);
        const completion = runCommandInWindow(
            project,
            'powershell.exe -File ask.ps1',
            new AbortController().signal,
            onOutput,
            { spawnCommand },
        );
        await vi.waitFor(() => expect(child.listenerCount('close')).toBe(1));
        child.emit('close', 0);

        await expect(completion).resolves.toEqual({command: 'powershell.exe -File ask.ps1', exitCode: 0, stderr: '', stdout: ''});
        expect(onOutput).not.toHaveBeenCalled();
        expect(spawnCommand).toHaveBeenCalledWith(
            'powershell.exe -File ask.ps1',
            {cwd: project.rootPath, detached: true, shell: true, stdio: 'inherit', windowsHide: false},
        );
    });

    it('terminates the visible command tree when cancelled', async () => {
        const project = await createGitProject();
        const child = createChild();
        const controller = new AbortController();
        const terminateProcessTree = vi.fn(async () => undefined);
        const completion = runCommandInWindow(project, 'pause', controller.signal, vi.fn(), {
            spawnCommand: () => child,
            terminateProcessTree,
        });
        await vi.waitFor(() => expect(child.listenerCount('close')).toBe(1));
        controller.abort();
        child.emit('close', 1);

        await expect(completion).rejects.toBeInstanceOf(ActionCancellationError);
        expect(terminateProcessTree).toHaveBeenCalledWith(child);
    });
});

describe('executeCommandAction', () => {
    it('resolves placeholders and streams command with injected runner', async () => {
        const commandRunner = vi.fn(async (_project, command, _signal, onOutput) => {
            onOutput({ stderr: '', stdout: 'chunk' });

            return { command, exitCode: 0, stderr: '', stdout: 'chunk' };
        });
        const onOutput = vi.fn();
        const input = {
            action: { showCommandWindow: false },
            activeCardsFolder: 'design/feature_descriptions',
            command: 'run {{active-cards-folder}} {{worktree-folder}} {{repository-folder}} {{project-folder}} {{releases-folder}} {{card-file}} {{this-card}} {{card-prompt}}',
            commandRunner,
            context: { file: 'design/card.md' },
            onOutput,
            primaryProject: { rootPath: 'C:/repo' },
            project: { rootPath: 'C:/worktree' },
            projectFolder: 'design',
            releasesFolder: 'design/releases',
            signal: new AbortController().signal,
        };

        const command = `run ${resolve('C:/repo', 'design/feature_descriptions')} C:/worktree C:/repo ${resolve('C:/repo', 'design')} ${resolve('C:/repo', 'design/releases')} design/card.md design/card.md `;

        await expect(executeCommandAction(input)).resolves.toMatchObject({ command });
        expect(onOutput).toHaveBeenCalledWith({ command, stderr: '', stdout: 'chunk' });
    });

    it.each(['card-file', 'this-card'])('rejects missing %s context before command start', async (placeholderName) => {
        const commandRunner = vi.fn();
        const input = {
            action: { showCommandWindow: false },
            activeCardsFolder: 'design/feature_descriptions',
            command: `run {{${placeholderName}}}`,
            commandRunner,
            context: { kind: 'project' },
            onOutput: vi.fn(),
            primaryProject: { rootPath: 'C:/repo' },
            project: { rootPath: 'C:/repo' },
            projectFolder: 'design',
            releasesFolder: 'design/releases',
            signal: new AbortController().signal,
        };

        expect(() => executeCommandAction(input)).toThrow(`Cannot resolve ${placeholderName} placeholder without a file context`);
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('uses the visible runner when the action enables its command window', async () => {
        const commandRunner = vi.fn();
        const commandWindowRunner = vi.fn(async (_project, command) => ({command, exitCode: 0, stderr: '', stdout: ''}));
        const input = {
            action: { showCommandWindow: true },
            activeCardsFolder: 'design/feature_descriptions',
            command: 'run tests',
            commandRunner,
            commandWindowRunner,
            context: { kind: 'project' },
            onOutput: vi.fn(),
            primaryProject: { rootPath: 'C:/repo' },
            project: { rootPath: 'C:/repo' },
            projectFolder: 'design',
            releasesFolder: 'design/releases',
            signal: new AbortController().signal,
        };

        await expect(executeCommandAction(input)).resolves.toMatchObject({ command: 'run tests' });
        expect(commandWindowRunner).toHaveBeenCalledOnce();
        expect(commandRunner).not.toHaveBeenCalled();
    });
});
