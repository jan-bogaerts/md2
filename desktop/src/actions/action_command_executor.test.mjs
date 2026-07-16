import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionCancellationError } = require('./action_cancellation_error');
const { executeCommandAction, runCommand } = require('./action_command_executor');

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

describe('executeCommandAction', () => {
    it('resolves placeholders and streams command with injected runner', async () => {
        const commandRunner = vi.fn(async (_project, command, _signal, onOutput) => {
            onOutput({ stderr: '', stdout: 'chunk' });

            return { command, exitCode: 0, stderr: '', stdout: 'chunk' };
        });
        const onOutput = vi.fn();
        const input = {
            action: { command: 'run {{card-file}} {{card-prompt}}' },
            commandRunner,
            context: { file: 'design/card.md' },
            extraPrompt: 'focus',
            onOutput,
            project: { rootPath: 'C:/repo' },
            signal: new AbortController().signal,
        };

        await expect(executeCommandAction(input)).resolves.toMatchObject({ command: 'run design/card.md focus' });
        expect(onOutput).toHaveBeenCalledWith({ command: 'run design/card.md focus', stderr: '', stdout: 'chunk' });
    });
});
