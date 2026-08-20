import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createUtilityProcessTerminalPoll } = require('./claude_usage_terminal_host');

const REQUEST = {
    cwd: '/project',
    env: { PATH: '/project/bin' },
    executable: 'claude.cmd',
    observedAt: Date.parse('2026-08-20T08:00:00.000Z'),
    timeoutMs: 20_000,
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

        await expect(result).resolves.toEqual({ payload: null, unavailable: false });
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

        await expect(result).resolves.toEqual({ payload: null, unavailable: false });
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

        await expect(result).resolves.toEqual({ payload: null, unavailable: false });
        expect(worker.kill).toHaveBeenCalledOnce();
    });

    it('resolves without a result when the worker cannot be forked', async () => {
        const { poll } = createHost(null);

        await expect(poll(REQUEST)).resolves.toEqual({ payload: null, unavailable: false });
    });
});
