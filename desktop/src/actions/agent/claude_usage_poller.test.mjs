import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ClaudeUsagePoller, parseClaudeUsageOutput } = require('./claude_usage_poller');

const USAGE_OUTPUT = `You are currently using your subscription to power your Claude Code usage

Current session: 17% used · resets Aug 15, 9:49pm (Europe/Brussels)
Current week (all models): 13% used · resets Aug 16, 6:59pm (Europe/Brussels)
`;

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

describe('parseClaudeUsageOutput', () => {
    it('parses both windows and converts localized IANA-zone resets to unix milliseconds', () => {
        const observedAt = Date.parse('2026-08-15T18:00:00.000Z');

        expect(parseClaudeUsageOutput(USAGE_OUTPUT, observedAt)).toEqual({
            windows: [
                { id: 'five_hour', resetsAt: Date.parse('2026-08-15T19:49:00.000Z'), usedPercent: 17 },
                { id: 'weekly', resetsAt: Date.parse('2026-08-16T16:59:00.000Z'), usedPercent: 13 },
            ],
        });
    });

    it('selects next year for a nearby January reset observed in December', () => {
        const output = USAGE_OUTPUT
            .replace('Aug 15, 9:49pm', 'Jan 1, 1:00am')
            .replace('Aug 16, 6:59pm', 'Jan 2, 1:00am');
        const observedAt = Date.parse('2026-12-31T22:00:00.000Z');

        expect(parseClaudeUsageOutput(output, observedAt)?.windows[0].resetsAt).toBe(Date.parse('2027-01-01T00:00:00.000Z'));
    });

    it('rejects partial and malformed output', () => {
        const observedAt = Date.parse('2026-08-15T18:00:00.000Z');

        expect(parseClaudeUsageOutput(USAGE_OUTPUT.split('Current week')[0], observedAt)).toBeNull();
        expect(parseClaudeUsageOutput(USAGE_OUTPUT.replace('17% used', '101% used'), observedAt)).toBeNull();
        expect(parseClaudeUsageOutput(USAGE_OUTPUT.replace('Europe/Brussels', 'Invalid/Zone'), observedAt)).toBeNull();
    });
});

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
        poller.stop();
    });

    it('does not publish malformed output and reports process failure as unavailable', async () => {
        const runtimeListener = vi.fn();
        const malformedPoller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('partial')),
        });

        malformedPoller.requestPoll();
        await malformedPoller.activePoll;
        expect(runtimeListener).not.toHaveBeenCalled();
        malformedPoller.stop();

        const failingPoller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            spawn: vi.fn(() => completedChild('', 1)),
        });
        failingPoller.requestPoll();
        await failingPoller.activePoll;
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unavailable' }));
        failingPoller.stop();
    });
});
