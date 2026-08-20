import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { runTerminalUsagePoll } = require('./claude_usage_terminal');

const TERMINAL_USAGE_OUTPUT = `Settings  Status  Config  Usage  Stats

Current session
▌                                                  1% used
Resets 3:20pm (Europe/Brussels)

Current week (all models)
██████                                             12% used
Resets Aug 23, 7pm (Europe/Brussels)
`;

const REQUEST = {
    cwd: '/project',
    env: { PATH: '/project/bin' },
    executable: 'claude.cmd',
    observedAt: Date.parse('2026-08-20T08:00:00.000Z'),
    timeoutMs: 20_000,
};

function terminalChild(output = TERMINAL_USAGE_OUTPUT, exitCode = null) {
    const dataListeners = new Set();
    const exitListeners = new Set();

    return {
        kill: vi.fn(),
        onData: vi.fn((listener) => {
            dataListeners.add(listener);

            return { dispose: () => dataListeners.delete(listener) };
        }),
        onExit: vi.fn((listener) => {
            exitListeners.add(listener);
            queueMicrotask(() => dataListeners.forEach((dataListener) => dataListener('Claude Code v2\r\n? for shortcuts\r\n')));

            return { dispose: () => exitListeners.delete(listener) };
        }),
        write: vi.fn(() => {
            queueMicrotask(() => {
                dataListeners.forEach((listener) => listener(`\u001B[2J\u001B[H${output.replaceAll('\n', '\r\n')}`));
                if (exitCode !== null) exitListeners.forEach((listener) => listener({ exitCode }));
            });
        }),
    };
}

describe('runTerminalUsagePoll', () => {
    it('spawns Claude in the requested directory and reads usage off the rendered screen', async () => {
        const processHandle = terminalChild();
        const ptySpawn = vi.fn(() => processHandle);

        const payload = await runTerminalUsagePoll(REQUEST, { ptySpawn });

        expect(ptySpawn).toHaveBeenCalledWith('claude.cmd', [], expect.objectContaining({ cwd: '/project', env: REQUEST.env }));
        expect(processHandle.write).toHaveBeenCalledWith('/usage\r');
        expect(processHandle.kill).toHaveBeenCalledOnce();
        expect(payload).toEqual({
            windows: [
                { id: 'five_hour', resetsAt: Date.parse('2026-08-20T13:20:00.000Z'), usedPercent: 1 },
                { id: 'weekly', resetsAt: Date.parse('2026-08-23T17:00:00.000Z'), usedPercent: 12 },
            ],
        });
    });

    it('reports usage even when killing the already exited pty throws', async () => {
        const processHandle = terminalChild();
        processHandle.kill = vi.fn(() => {
            throw new Error('Cannot kill a pty that has already exited');
        });

        const payload = await runTerminalUsagePoll(REQUEST, { ptySpawn: () => processHandle });

        expect(payload.windows).toContainEqual(expect.objectContaining({ id: 'weekly', usedPercent: 12 }));
    });

    it('resolves without usage when the screen never shows a complete report', async () => {
        await expect(runTerminalUsagePoll(REQUEST, { ptySpawn: () => terminalChild('partial', 0) })).resolves.toBeNull();
    });

    it('rejects when Claude exits in failure so the caller can mark it unavailable', async () => {
        await expect(runTerminalUsagePoll(REQUEST, { ptySpawn: () => terminalChild('partial', 1) })).rejects.toThrow('Claude usage terminal failed');
    });

    it('gives up and kills the pty once the deadline passes', async () => {
        const processHandle = terminalChild();
        processHandle.write = vi.fn();

        const payload = await runTerminalUsagePoll({ ...REQUEST, timeoutMs: 20 }, { ptySpawn: () => processHandle });

        expect(payload).toBeNull();
        expect(processHandle.kill).toHaveBeenCalledOnce();
    });

    it('kills the pty and resolves without usage when aborted mid-poll', async () => {
        const processHandle = terminalChild();
        processHandle.write = vi.fn();
        let abort = null;

        const poll = runTerminalUsagePoll(REQUEST, {
            ptySpawn: () => processHandle,
            registerAbort: (handler) => {
                abort ??= handler;
            },
        });
        await vi.waitFor(() => expect(processHandle.write).toHaveBeenCalledWith('/usage\r'));
        abort();

        await expect(poll).resolves.toBeNull();
        expect(processHandle.kill).toHaveBeenCalledOnce();
    });
});
