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

const TERMINAL_USAGE_OUTPUT = `Settings  Status  Config  Usage  Stats

Current session
▌                                                  1% used
Resets 3:20pm (Europe/Brussels)

Current week (all models)
██████                                             12% used
Resets Aug 23, 7pm (Europe/Brussels)
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

function terminalChild(output = TERMINAL_USAGE_OUTPUT, exitCode = 0) {
    const dataListeners = new Set();
    const exitListeners = new Set();
    const processHandle = {
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

    return processHandle;
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

    it('keeps support for mojibake legacy separators', () => {
        const output = USAGE_OUTPUT.replaceAll('Â·', '\u00B7');
        const observedAt = Date.parse('2026-08-15T18:00:00.000Z');

        expect(parseClaudeUsageOutput(output, observedAt)?.windows.map(({ usedPercent }) => usedPercent)).toEqual([17, 13]);
    });

    it('parses full-screen session and weekly percentages with both reset formats', () => {
        const observedAt = Date.parse('2026-08-20T08:00:00.000Z');

        expect(parseClaudeUsageOutput(TERMINAL_USAGE_OUTPUT, observedAt)).toEqual({
            windows: [
                { id: 'five_hour', resetsAt: Date.parse('2026-08-20T13:20:00.000Z'), usedPercent: 1 },
                { id: 'weekly', resetsAt: Date.parse('2026-08-23T17:00:00.000Z'), usedPercent: 12 },
            ],
        });
    });

    it('uses the following local day when a time-only reset is after midnight', () => {
        const output = TERMINAL_USAGE_OUTPUT.replace('3:20pm', '1am');
        const observedAt = Date.parse('2026-08-20T21:00:00.000Z');

        expect(parseClaudeUsageOutput(output, observedAt)?.windows[0].resetsAt).toBe(Date.parse('2026-08-20T23:00:00.000Z'));
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

    it('falls back to a terminal and requests usage after Claude becomes ready', async () => {
        const runtimeListener = vi.fn();
        const processHandle = terminalChild(TERMINAL_USAGE_OUTPUT, null);
        const ptySpawn = vi.fn(() => processHandle);
        const poller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude.cmd') },
            onRuntimeEvent: runtimeListener,
            ptySpawn,
            spawn: vi.fn(() => completedChild('You are currently using your subscription')),
        });

        poller.requestPoll({ cwd: '/project', env: { PATH: '/project/bin' } });
        await poller.activePoll;

        expect(ptySpawn).toHaveBeenCalledWith('claude.cmd', [], expect.objectContaining({ cwd: '/project' }));
        expect(processHandle.write).toHaveBeenCalledWith('/usage\r');
        expect(processHandle.kill).toHaveBeenCalledOnce();
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'snapshot',
            payload: expect.objectContaining({ windows: expect.arrayContaining([expect.objectContaining({ id: 'weekly', usedPercent: 12 })]) }),
        }));
        poller.stop();
    });

    it('does not publish malformed output and reports process failure as unavailable', async () => {
        const runtimeListener = vi.fn();
        const malformedPoller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            ptySpawn: vi.fn(() => terminalChild('partial', 0)),
            spawn: vi.fn(() => completedChild('partial')),
        });

        malformedPoller.requestPoll();
        await malformedPoller.activePoll;
        expect(runtimeListener).not.toHaveBeenCalled();
        malformedPoller.stop();

        const failingPoller = new ClaudeUsagePoller({
            executableResolver: { find: vi.fn(async () => 'claude') },
            onRuntimeEvent: runtimeListener,
            ptySpawn: vi.fn(() => terminalChild('partial', 1)),
            spawn: vi.fn(() => completedChild('', 1)),
        });
        failingPoller.requestPoll();
        await failingPoller.activePoll;
        expect(runtimeListener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unavailable' }));
        failingPoller.stop();
    });
});
