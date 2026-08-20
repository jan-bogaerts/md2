import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ClaudeUsagePoller } = require('./claude_usage_poller');

const USAGE_OUTPUT = `You are currently using your subscription to power your Claude Code usage

Current session: 17% used · resets Aug 15, 9:49pm (Europe/Brussels)
Current week (all models): 13% used · resets Aug 16, 6:59pm (Europe/Brussels)
`;
const TERMINAL_PAYLOAD = { windows: [{ id: 'weekly', resetsAt: 1, usedPercent: 12 }] };
const NO_TERMINAL_RESULT = { payload: null, unavailable: false };

function completedChild(output = USAGE_OUTPUT, exitCode = 0) {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
        child.stdout.write(output);
        child.stdout.end();
        child.emit('close', exitCode);
    });

    return child;
}

function hangingChild() {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => child.emit('close', 1));

    return child;
}

describe('ClaudeUsagePoller', () => {
    afterEach(() => vi.useRealTimers());

    it('polls immediately after output and coalesces requests to one poll per two minutes', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-15T18:00:00.000Z'));
        const runtimeListener = vi.fn();
        const spawn = vi.fn(() => completedChild());
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude.cmd') },
            onRuntimeEvent: runtimeListener,
            spawn,
        });

        poller.requestPoll();
        await poller.activePoll;
        expect(spawn).toHaveBeenCalledOnce();
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot' }));

        poller.requestPoll();
        poller.requestPoll();
        await vi.advanceTimersByTimeAsync(119_999);
        expect(spawn).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        await poller.activePoll;
        expect(spawn).toHaveBeenCalledTimes(2);
        expect(runtimeListener).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'snapshot' }));
        poller.stop();
    });

    it('spawns within the requesting project cwd and environment', async () => {
        const runtimeListener = vi.fn();
        const spawn = vi.fn(() => completedChild());
        const find = vi.fn(async () => 'claude.cmd');
        const env = { PATH: '/project/bin' };
        const poller = new ClaudeUsagePoller({
            executableResolver: { find },
            onRuntimeEvent: runtimeListener,
            spawn,
        });

        poller.requestPoll({ cwd: '/project', env });
        await poller.activePoll;

        expect(find).toHaveBeenCalledWith('claude', { cwd: '/project', env });
        expect(spawn).toHaveBeenCalledWith('claude.cmd', [], expect.objectContaining({ cwd: '/project', env }));
        poller.stop();
    });

    it('hands unparsed output to the worker poll and publishes the usage it reports', async () => {
        const runtimeListener = vi.fn();
        const terminalPoll = vi.fn(async () => ({ payload: TERMINAL_PAYLOAD, unavailable: false }));
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude.cmd') },
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('You are currently using your subscription')),
            terminalPoll,
        });

        poller.requestPoll({ cwd: '/project', env: { PATH: '/project/bin' } });
        await poller.activePoll;

        expect(terminalPoll).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: '/project', env: { PATH: '/project/bin' }, executable: 'claude.cmd' }),
            expect.objectContaining({ registerAbort: expect.any(Function) }),
        );
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot', payload: TERMINAL_PAYLOAD }));
        poller.stop();
    });

    it('publishes nothing when neither the process nor the worker reports usage', async () => {
        const runtimeListener = vi.fn();
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('partial')),
            terminalPoll: vi.fn(async () => NO_TERMINAL_RESULT),
        });

        poller.requestPoll();
        await poller.activePoll;

        expect(runtimeListener).not.toHaveBeenCalled();
        poller.stop();
    });

    it('reports Claude as unavailable when the worker cannot run it', async () => {
        const runtimeListener = vi.fn();
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('', 1)),
            terminalPoll: vi.fn(async () => ({ payload: null, unavailable: true })),
        });

        poller.requestPoll();
        await poller.activePoll;

        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unavailable' }));
        poller.stop();
    });

    it('drains stderr, gives up on a Claude process that never exits and tolerates stdin pipe errors', async () => {
        const runtimeListener = vi.fn();
        const child = hangingChild();
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            processTimeoutMs: 20,
            spawn: vi.fn(() => child),
            terminalPoll: vi.fn(async () => ({ payload: TERMINAL_PAYLOAD, unavailable: false })),
        });

        poller.requestPoll();
        await poller.activePoll;

        expect(child.stderr.isPaused()).toBe(false);
        expect(child.kill).toHaveBeenCalledOnce();
        expect(() => child.stdin.emit('error', new Error('EPIPE'))).not.toThrow();
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot' }));
        poller.stop();
    });

    it('aborts an in-flight worker poll when stopped', async () => {
        const runtimeListener = vi.fn();
        const abort = vi.fn();
        let registered = null;
        const terminalPoll = vi.fn((request, { registerAbort }) => new Promise((resolve) => {
            registerAbort(abort);
            registered = () => resolve(NO_TERMINAL_RESULT);
        }));
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('partial')),
            terminalPoll,
        });

        poller.requestPoll();
        await vi.waitFor(() => expect(registered).not.toBeNull());
        poller.stop();
        registered();
        await poller.activePoll;

        expect(abort).toHaveBeenCalledOnce();
        expect(runtimeListener).not.toHaveBeenCalled();
    });

    it('keeps polling after the runtime listener throws', async () => {
        const runtimeListener = vi.fn(() => {
            throw new Error('listener failed');
        });
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild()),
        });

        poller.requestPoll();
        await expect(poller.activePoll).resolves.toBeUndefined();
        expect(poller.activePoll).toBeNull();
        poller.stop();
    });
});
