import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ClaudeUsagePoller } = require('./claude_usage_poller');
const { CLAUDE_USAGE_EXCERPT_MAX_CHARS, CLAUDE_USAGE_POLL_REASONS } = require('./claude_usage_diagnostics');

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

/** Every record either poll attempt writes, in the order they were written. */
function pollRecords() {
    return [...console.warn.mock.calls, ...console.error.mock.calls].map(([, record]) => record);
}

describe('ClaudeUsagePoller', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('constructs without an executable resolver', () => {
        expect(() => new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            terminalPoll: vi.fn(),
        })).not.toThrow();
    });

    it('rejects a missing or empty executable without scheduling work', () => {
        const setTimeout = vi.fn();
        const spawn = vi.fn();
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            setTimeout,
            spawn,
            terminalPoll: vi.fn(),
        });

        expect(() => poller.requestPoll()).toThrow('Claude usage poll requires an executable');
        expect(() => poller.requestPoll({ executable: '' })).toThrow('Claude usage poll requires an executable');
        expect(() => poller.requestPoll({ executable: '   ' })).toThrow('Claude usage poll requires an executable');
        expect(poller.pendingRequest).toBeNull();
        expect(poller.activePoll).toBeNull();
        expect(setTimeout).not.toHaveBeenCalled();
        expect(spawn).not.toHaveBeenCalled();
    });

    it('polls immediately after output and coalesces requests to one poll per two minutes', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-15T18:00:00.000Z'));
        const runtimeListener = vi.fn();
        const spawn = vi.fn(() => completedChild());
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: runtimeListener,
            spawn,
        });

        poller.requestPoll({ executable: 'claude.cmd' });
        await poller.activePoll;
        expect(spawn).toHaveBeenCalledOnce();
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot' }));

        poller.requestPoll({ executable: 'claude.cmd' });
        poller.requestPoll({ executable: 'claude.cmd' });
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
        const env = { PATH: '/project/bin' };
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: runtimeListener,
            spawn,
        });

        poller.requestPoll({ cwd: '/project', env, executable: '/tools/custom-claude' });
        await poller.activePoll;

        expect(spawn).toHaveBeenCalledWith('/tools/custom-claude', [], expect.objectContaining({ cwd: '/project', env }));
        poller.stop();
    });

    it('uses request observation time and request-scoped runtime listener', async () => {
        const defaultListener = vi.fn();
        const startupListener = vi.fn();
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: defaultListener,
            spawn: vi.fn(() => completedChild()),
        });

        poller.requestPoll({ executable: 'claude.cmd', observedAt: 10, onRuntimeEvent: startupListener });
        await poller.activePoll;

        expect(startupListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot', observedAt: 10 }));
        expect(defaultListener).not.toHaveBeenCalled();
        poller.stop();
    });

    it('hands unparsed output to the worker poll and publishes the usage it reports', async () => {
        const runtimeListener = vi.fn();
        const terminalPoll = vi.fn(async () => ({ payload: TERMINAL_PAYLOAD, unavailable: false }));
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('You are currently using your subscription')),
            terminalPoll,
        });

        poller.requestPoll({ cwd: '/project', env: { PATH: '/project/bin' }, executable: '/tools/custom-claude' });
        await poller.activePoll;

        expect(terminalPoll).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: '/project', env: { PATH: '/project/bin' }, executable: '/tools/custom-claude' }),
            expect.objectContaining({ registerAbort: expect.any(Function) }),
        );
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot', payload: TERMINAL_PAYLOAD }));
        poller.stop();
    });

    it('keeps one request snapshot through fallback while a newer request waits', async () => {
        const child = new EventEmitter();
        child.stdin = new PassThrough();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        const terminalPoll = vi.fn(async () => ({ payload: TERMINAL_PAYLOAD, unavailable: false }));
        const spawn = vi.fn(() => child);
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            spawn,
            terminalPoll,
        });
        const firstEnvironment = { PATH: '/first/bin' };
        const secondEnvironment = { PATH: '/second/bin' };

        poller.requestPoll({ cwd: '/first', env: firstEnvironment, executable: '/tools/first-claude' });
        poller.requestPoll({ cwd: '/second', env: secondEnvironment, executable: '/tools/second-claude' });
        child.stdout.end('partial');
        child.emit('close', 0);
        await poller.activePoll;

        expect(spawn).toHaveBeenCalledWith('/tools/first-claude', [], expect.objectContaining({
            cwd: '/first',
            env: firstEnvironment,
        }));
        expect(terminalPoll).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: '/first', env: firstEnvironment, executable: '/tools/first-claude' }),
            expect.objectContaining({ registerAbort: expect.any(Function) }),
        );
        expect(poller.pendingRequest).toEqual(expect.objectContaining({
            cwd: '/second',
            env: secondEnvironment,
            executable: '/tools/second-claude',
        }));
        poller.stop();
    });

    it('publishes usage printed before a failed exit without falling back to the worker', async () => {
        const runtimeListener = vi.fn();
        const terminalPoll = vi.fn(async () => NO_TERMINAL_RESULT);
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild(USAGE_OUTPUT, 1)),
            terminalPoll,
        });

        poller.requestPoll({ executable: 'claude' });
        await poller.activePoll;

        expect(terminalPoll).not.toHaveBeenCalled();
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot' }));
        poller.stop();
    });

    it('publishes nothing when neither the process nor the worker reports usage', async () => {
        const runtimeListener = vi.fn();
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('partial')),
            terminalPoll: vi.fn(async () => NO_TERMINAL_RESULT),
        });

        poller.requestPoll({ executable: 'claude' });
        await poller.activePoll;

        expect(runtimeListener).not.toHaveBeenCalled();
        poller.stop();
    });

    it('reports Claude as unavailable when the worker cannot run it', async () => {
        const runtimeListener = vi.fn();
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('', 1)),
            terminalPoll: vi.fn(async () => ({ payload: null, unavailable: true })),
        });

        poller.requestPoll({ executable: 'claude' });
        await poller.activePoll;

        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unavailable' }));
        poller.stop();
    });

    it('drains stderr, gives up on a Claude process that never exits and tolerates stdin pipe errors', async () => {
        const runtimeListener = vi.fn();
        const child = hangingChild();
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: runtimeListener,
            processTimeoutMs: 20,
            spawn: vi.fn(() => child),
            terminalPoll: vi.fn(async () => ({ payload: TERMINAL_PAYLOAD, unavailable: false })),
        });

        poller.requestPoll({ executable: 'claude' });
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
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('partial')),
            terminalPoll,
        });

        poller.requestPoll({ executable: 'claude' });
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
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild()),
        });

        poller.requestPoll({ executable: 'claude' });
        await expect(poller.activePoll).resolves.toBeUndefined();
        expect(poller.activePoll).toBeNull();
        poller.stop();
    });

    it('says nothing at all when a poll succeeds', async () => {
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            spawn: vi.fn(() => completedChild()),
        });

        poller.requestPoll({ executable: 'claude' });
        await poller.activePoll;

        expect(console.warn).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
        poller.stop();
    });

    it('records unparseable stdout once, with the attempt, folder, executable and an excerpt', async () => {
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            spawn: vi.fn(() => completedChild('nothing a parser can use')),
            terminalPoll: vi.fn(async () => ({ payload: TERMINAL_PAYLOAD, unavailable: false })),
        });

        poller.requestPoll({ cwd: '/project', executable: '/tools/claude' });
        await poller.activePoll;

        const records = pollRecords();
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            attempt: 'stdout',
            cwd: '/project',
            executable: '/tools/claude',
            reason: CLAUDE_USAGE_POLL_REASONS.stdoutUnparsed,
            screenExcerpt: 'nothing a parser can use',
        });
        expect(records[0].elapsedMs).toEqual(expect.any(Number));
        poller.stop();
    });

    it('records a spawn failure as an error with the message that caused it', async () => {
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            spawn: vi.fn(() => {
                throw new Error('spawn ENOENT');
            }),
            terminalPoll: vi.fn(),
        });

        poller.requestPoll({ executable: 'claude' });
        await poller.activePoll;

        expect(console.error).toHaveBeenCalledOnce();
        expect(pollRecords()[0]).toMatchObject({
            attempt: 'stdout',
            error: 'spawn ENOENT',
            reason: CLAUDE_USAGE_POLL_REASONS.stdoutSpawnFailed,
        });
        poller.stop();
    });

    it('passes each pty failure reason through to its own record, with the screen the worker saw', async () => {
        const reasons = [
            CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker,
            CLAUDE_USAGE_POLL_REASONS.ptyTrustScreenUnanswered,
            CLAUDE_USAGE_POLL_REASONS.ptyReportTimeout,
            CLAUDE_USAGE_POLL_REASONS.workerForkFailed,
            CLAUDE_USAGE_POLL_REASONS.workerExitedWithoutReply,
            CLAUDE_USAGE_POLL_REASONS.hostDeadline,
            CLAUDE_USAGE_POLL_REASONS.ptyLoginRequired,
        ];

        for (const reason of reasons) {
            console.warn.mockClear();
            console.error.mockClear();
            const poller = new ClaudeUsagePoller({
                onRuntimeEvent: vi.fn(),
                spawn: vi.fn(() => completedChild('partial')),
                terminalPoll: vi.fn(async () => ({
                    payload: null,
                    reason,
                    screenExcerpt: 'last screen',
                    unavailable: false,
                })),
            });

            poller.requestPoll({ executable: 'claude' });
            await poller.activePoll;

            const ptyRecords = pollRecords().filter((record) => record.attempt === 'pty');
            expect(ptyRecords).toHaveLength(1);
            expect(ptyRecords[0]).toMatchObject({ reason, screenExcerpt: 'last screen' });
            poller.stop();
        }
    });

    it('writes a bounded number of records however much Claude printed', async () => {
        const noisyOutput = 'unparseable chatter '.repeat(50_000);
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            spawn: vi.fn(() => completedChild(noisyOutput)),
            terminalPoll: vi.fn(async () => ({
                payload: null,
                reason: CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker,
                screenExcerpt: 'x'.repeat(CLAUDE_USAGE_EXCERPT_MAX_CHARS),
                unavailable: false,
            })),
        });

        poller.requestPoll({ executable: 'claude' });
        await poller.activePoll;

        // One per attempt, whatever the volume: this poll repeats forever on an interval.
        const records = pollRecords();
        expect(records).toHaveLength(2);
        for (const record of records) {
            expect(record.screenExcerpt.length).toBeLessThanOrEqual(CLAUDE_USAGE_EXCERPT_MAX_CHARS + 1);
        }
        poller.stop();
    });

    it('gives the plain-stdout attempt and the pty fallback independent budgets', async () => {
        vi.useFakeTimers();
        const child = hangingChild();
        let terminalRequest = null;
        const poller = new ClaudeUsagePoller({
            onRuntimeEvent: vi.fn(),
            readyTimeoutMs: 30_000,
            reportTimeoutMs: 20_000,
            spawn: vi.fn(() => child),
            terminalPoll: vi.fn(async (request) => {
                terminalRequest = request;

                return { payload: TERMINAL_PAYLOAD, unavailable: false };
            }),
        });

        poller.requestPoll({ executable: 'claude' });
        // The stdout attempt burns its own budget only; exhausting it leaves the fallback untouched.
        await vi.advanceTimersByTimeAsync(5_000);
        await poller.activePoll;

        expect(child.kill).toHaveBeenCalledOnce();
        expect(terminalRequest).toMatchObject({ readyTimeoutMs: 30_000, reportTimeoutMs: 20_000, timeoutMs: 50_000 });
        poller.stop();
    });
});
