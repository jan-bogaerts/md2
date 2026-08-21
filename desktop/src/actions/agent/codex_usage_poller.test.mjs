import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { CodexUsagePoller } = require('./codex_usage_poller');

function createChild() {
    const child = new EventEmitter();
    child.exitCode = null;
    child.pid = 42;
    child.signalCode = null;
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.writtenData = '';
    child.stdin.on('data', (chunk) => {
        child.writtenData += chunk.toString();
    });

    return child;
}

function writtenMessages(child) {
    return child.writtenData.trim().split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line));
}

async function initialize(child) {
    child.stdout.write(`${JSON.stringify({ id: 1, result: { userAgent: 'codex' } })}\n`);
    await vi.waitFor(() => expect(writtenMessages(child)).toHaveLength(3));
}

describe('CodexUsagePoller', () => {
    afterEach(() => vi.useRealTimers());

    it('initializes and reads account usage without creating a thread or turn', async () => {
        const child = createChild();
        const onRuntimeEvent = vi.fn();
        const terminateProcessTree = vi.fn(async () => undefined);
        const poller = new CodexUsagePoller({ onRuntimeEvent, spawn: vi.fn(() => child), terminateProcessTree });

        poller.requestPoll({ argumentsList: ['--custom'], cwd: 'C:\\startup', env: { Path: 'C:\\tools' }, executable: 'codex.cmd', observedAt: 10 });
        await vi.waitFor(() => expect(writtenMessages(child)).toHaveLength(1));
        await initialize(child);
        const messages = writtenMessages(child);

        expect(messages).toEqual([
            expect.objectContaining({ id: 1, method: 'initialize' }),
            { method: 'initialized', params: {} },
            { id: 2, method: 'account/rateLimits/read' },
        ]);
        expect(messages.some(({ method }) => method?.startsWith('thread/') || method?.startsWith('turn/'))).toBe(false);

        const payload = { rateLimits: { limitId: 'codex' } };
        child.stdout.write(`${JSON.stringify({ id: 2, result: payload })}\n`);
        await poller.activePoll;

        expect(onRuntimeEvent).toHaveBeenCalledWith({ kind: 'snapshot', observedAt: 10, payload });
        expect(terminateProcessTree).toHaveBeenCalledWith(child);
    });

    it.each([
        ['malformed output', (child) => child.stdout.write('not-json\n')],
        ['protocol error', (child) => child.stdout.write(`${JSON.stringify({ error: { message: 'failed' }, id: 1 })}\n`)],
        ['malformed response', async (child) => {
            await initialize(child);
            child.stdout.write(`${JSON.stringify({ id: 2, result: {} })}\n`);
        }],
        ['process exit', (child) => child.emit('close', 1)],
    ])('publishes unavailable and cleans process after %s', async (_name, fail) => {
        const child = createChild();
        const onRuntimeEvent = vi.fn();
        const terminateProcessTree = vi.fn(async () => undefined);
        const poller = new CodexUsagePoller({ onRuntimeEvent, spawn: vi.fn(() => child), terminateProcessTree });

        poller.requestPoll({ executable: 'codex', observedAt: 11 });
        await fail(child);
        await poller.activePoll;

        expect(onRuntimeEvent).toHaveBeenCalledWith({ kind: 'unavailable', observedAt: 11 });
        expect(terminateProcessTree).toHaveBeenCalledWith(child);
    });

    it('times out, terminates process, and publishes unavailable', async () => {
        vi.useFakeTimers();
        const child = createChild();
        const onRuntimeEvent = vi.fn();
        const terminateProcessTree = vi.fn(async () => undefined);
        const poller = new CodexUsagePoller({ onRuntimeEvent, spawn: vi.fn(() => child), terminateProcessTree, timeoutMs: 50 });

        poller.requestPoll({ executable: 'codex', observedAt: 12 });
        await vi.advanceTimersByTimeAsync(50);
        await poller.activePoll;

        expect(onRuntimeEvent).toHaveBeenCalledWith({ kind: 'unavailable', observedAt: 12 });
        expect(terminateProcessTree).toHaveBeenCalledWith(child);
    });

    it('stops pending poll without publishing unavailable', async () => {
        const child = createChild();
        const onRuntimeEvent = vi.fn();
        const terminateProcessTree = vi.fn(async () => undefined);
        const poller = new CodexUsagePoller({ onRuntimeEvent, spawn: vi.fn(() => child), terminateProcessTree });

        poller.requestPoll({ executable: 'codex' });
        await poller.stop();

        expect(terminateProcessTree).toHaveBeenCalledWith(child);
        expect(onRuntimeEvent).not.toHaveBeenCalled();
    });
});
