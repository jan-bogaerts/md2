import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createUtilityProcessTerminalPoll } = require('./claude_usage_terminal_host');
const { CLAUDE_USAGE_POLL_REASONS } = require('./claude_usage_diagnostics');

const REQUEST = {
    cwd: '/project',
    env: { PATH: '/project/bin' },
    executable: 'claude.cmd',
    observedAt: Date.parse('2026-08-20T08:00:00.000Z'),
    readyTimeoutMs: 30_000,
    reportTimeoutMs: 20_000,
    timeoutMs: 50_000,
};
const USAGE_RESULT = {
    payload: { windows: [{ id: 'weekly', resetsAt: 1, usedPercent: 12 }] },
    unavailable: false,
};

function fakeWorker() {
    const listeners = new Map();

    return {
        emit: (event, ...args) => listeners.get(event)?.(...args),
        kill: vi.fn(),
        on: vi.fn((event, listener) => listeners.set(event, listener)),
        postMessage: vi.fn(),
    };
}

function createHost(worker, overrides = {}) {
    const fork = vi.fn(() => {
        if (!worker) throw new Error('Cannot fork the usage worker');

        return worker;
    });
    const poll = createUtilityProcessTerminalPoll({
        loadUtilityProcess: () => ({ fork }),
        workerPath: '/worker.js',
        ...overrides,
    });

    return { fork, poll };
}

describe('createUtilityProcessTerminalPoll', () => {
    it('sends the request once the worker spawns and resolves with its result', async () => {
        const worker = fakeWorker();
        const { fork, poll } = createHost(worker);

        const result = poll(REQUEST, { registerAbort: () => {} });
        worker.emit('spawn');
        worker.emit('message', { result: USAGE_RESULT });

        expect(fork).toHaveBeenCalledWith('/worker.js', [], expect.objectContaining({ stdio: 'inherit' }));
        expect(worker.postMessage).toHaveBeenCalledWith(REQUEST);
        await expect(result).resolves.toEqual(USAGE_RESULT);
        expect(worker.kill).toHaveBeenCalledOnce();
    });

    // A native ConPTY fault kills the worker outright, which is the whole reason the pty lives out of process.
    it('treats a worker that dies without replying as an inconclusive poll', async () => {
        const worker = fakeWorker();
        const { poll } = createHost(worker);

        const result = poll(REQUEST);
        worker.emit('spawn');
        worker.emit('exit', 3221225477);

        await expect(result).resolves.toMatchObject({
            payload: null,
            reason: CLAUDE_USAGE_POLL_REASONS.workerExitedWithoutReply,
            unavailable: false,
        });
    });

    it('ignores a worker exit that follows its own reply', async () => {
        const worker = fakeWorker();
        const { poll } = createHost(worker);

        const result = poll(REQUEST);
        worker.emit('spawn');
        worker.emit('message', { result: USAGE_RESULT });
        worker.emit('exit', 0);

        await expect(result).resolves.toEqual(USAGE_RESULT);
    });

    it('reports unavailability the worker observed', async () => {
        const worker = fakeWorker();
        const { poll } = createHost(worker);

        const result = poll(REQUEST);
        worker.emit('spawn');
        worker.emit('message', { result: { payload: null, unavailable: true } });

        await expect(result).resolves.toEqual({ payload: null, unavailable: true });
    });

    it('kills a worker that outlives the deadline', async () => {
        vi.useFakeTimers();
        const worker = fakeWorker();
        const { poll } = createHost(worker);

        const result = poll(REQUEST);
        worker.emit('spawn');
        await vi.advanceTimersByTimeAsync(REQUEST.timeoutMs + 5_000);

        await expect(result).resolves.toMatchObject({
            payload: null,
            reason: CLAUDE_USAGE_POLL_REASONS.hostDeadline,
            unavailable: false,
        });
        expect(worker.kill).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });

    it('kills the worker when the poll is aborted', async () => {
        const worker = fakeWorker();
        const { poll } = createHost(worker);
        let abort = null;

        const result = poll(REQUEST, {
            registerAbort: (handler) => {
                abort ??= handler;
            },
        });
        worker.emit('spawn');
        abort();

        await expect(result).resolves.toMatchObject({
            payload: null,
            reason: CLAUDE_USAGE_POLL_REASONS.pollAborted,
            unavailable: false,
        });
        expect(worker.kill).toHaveBeenCalledOnce();
    });

    it('names a fork failure and carries the error that caused it', async () => {
        const { poll } = createHost(null);

        await expect(poll(REQUEST)).resolves.toMatchObject({
            error: 'Cannot fork the usage worker',
            payload: null,
            reason: CLAUDE_USAGE_POLL_REASONS.workerForkFailed,
            unavailable: false,
        });
    });

    // These four paths shared one result until now, which left the console unable to say which ran.
    it('gives the fork failure, the silent exit, the abort and the deadline four distinct reasons', async () => {
        vi.useFakeTimers();
        const exitWorker = fakeWorker();
        const exited = createHost(exitWorker).poll(REQUEST);
        exitWorker.emit('spawn');
        exitWorker.emit('exit', 3221225477);
        const abortWorker = fakeWorker();
        let abort = null;
        const aborted = createHost(abortWorker).poll(REQUEST, {
            registerAbort: (handler) => {
                abort ??= handler;
            },
        });
        abortWorker.emit('spawn');
        abort();
        const deadlineWorker = fakeWorker();
        const timedOut = createHost(deadlineWorker).poll(REQUEST);
        deadlineWorker.emit('spawn');
        await vi.advanceTimersByTimeAsync(REQUEST.timeoutMs + 5_000);

        const results = await Promise.all([createHost(null).poll(REQUEST), exited, aborted, timedOut]);

        expect(new Set(results.map(({ reason }) => reason)).size).toBe(4);
        vi.useRealTimers();
    });
});
