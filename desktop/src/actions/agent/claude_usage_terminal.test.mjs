import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { runTerminalUsagePoll } = require('./claude_usage_terminal');
const { CLAUDE_USAGE_EXCERPT_MAX_CHARS, CLAUDE_USAGE_POLL_REASONS } = require('./claude_usage_diagnostics');

const TERMINAL_USAGE_OUTPUT = `Settings  Status  Config  Usage  Stats

Current session
▌                                                  1% used
Resets 3:20pm (Europe/Brussels)

Current week (all models)
██████                                             12% used
Resets Aug 23, 7pm (Europe/Brussels)
`;
// The exact screen Claude Code 2.1.238 shows in a folder it has never run in.
const TRUST_SCREEN = `Accessing workspace:
C:\\projects\\md2
Quick safety check: Is this a project you created or one you trust?
Security guide
❯ 1. Yes, I trust this folder
  2. No, exit
Enter to confirm · Esc to cancel
`;
const LOGIN_SCREEN = 'Select login method:\r\n1. Claude account with subscription\r\n';
const ONBOARDING_SCREEN = 'Choose the text style that looks best with your terminal\r\n';
const WELCOME_SCREEN = 'Claude Code v2\r\n? for shortcuts\r\n';
// Claude Code 2.1.241 settles on a bare input prompt: no `? for shortcuts` and no `Try "` hint.
const PROMPT_SCREEN = 'Claude Code v2.1.241\n\n> ';
// The same settled prompt, preceded by a `>` in prose that must not be mistaken for the input line.
const PROMPT_SCREEN_WITH_STRAY_MARKER = 'Run > claude --help for options\n\n> ';
// A startup screen whose only `>` sits away from the cursor, so nothing on it signals readiness.
const STRAY_MARKER_SCREEN = 'Run > claude --help for options\nStill starting up';
// The trust prompt with the cursor parked on its preselected option rather than on a trailing line.
const TRUST_SCREEN_ON_OPTION = 'Accessing workspace:\n  2. No, exit\n❯ 1. Yes, I trust this folder';
const LOGIN_SCREEN_WITH_PROMPT = `${LOGIN_SCREEN}\n> `;
const ONBOARDING_SCREEN_WITH_PROMPT = `${ONBOARDING_SCREEN}\n> `;

const REQUEST = {
    cwd: '/project',
    env: { PATH: '/project/bin' },
    executable: 'claude.cmd',
    observedAt: Date.parse('2026-08-20T08:00:00.000Z'),
    readyTimeoutMs: 30_000,
    reportTimeoutMs: 20_000,
};

function clearScreen(text) {
    return `\u001B[2J\u001B[H${text.replaceAll('\n', '\r\n')}`;
}

function terminalChild(output = TERMINAL_USAGE_OUTPUT, exitCode = null, startup = {}) {
    const { redraws = 1, screen = WELCOME_SCREEN } = startup;
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
            // Claude redraws its startup screen while it settles; every redraw reaches the poller.
            queueMicrotask(() => {
                for (let redraw = 0; redraw < redraws; redraw += 1) {
                    dataListeners.forEach((dataListener) => dataListener(clearScreen(screen)));
                }
            });

            return { dispose: () => exitListeners.delete(listener) };
        }),
        write: vi.fn(() => {
            queueMicrotask(() => {
                dataListeners.forEach((listener) => listener(clearScreen(output)));
                if (exitCode !== null) exitListeners.forEach((listener) => listener({ exitCode }));
            });
        }),
    };
}

/** A pty that starts on the trust screen and only reaches the welcome screen once it is answered. */
function trustingChild({ answerLeadsToWelcome = true } = {}) {
    const dataListeners = new Set();
    const exitListeners = new Set();
    const emit = (text) => dataListeners.forEach((listener) => listener(clearScreen(text)));
    const handle = {
        kill: vi.fn(),
        onData: vi.fn((listener) => {
            dataListeners.add(listener);

            return { dispose: () => dataListeners.delete(listener) };
        }),
        onExit: vi.fn((listener) => {
            exitListeners.add(listener);
            queueMicrotask(() => emit(TRUST_SCREEN));

            return { dispose: () => exitListeners.delete(listener) };
        }),
        write: vi.fn((data) => {
            if (data === '\r') {
                // Answering trust either lands on the welcome screen or leaves the same screen up.
                queueMicrotask(() => emit(answerLeadsToWelcome ? WELCOME_SCREEN : TRUST_SCREEN));
                return;
            }
            queueMicrotask(() => emit(TERMINAL_USAGE_OUTPUT));
        }),
    };

    return handle;
}

/** A pty stuck on one screen, used to prove the ready deadline and not the report deadline expired. */
function stuckChild(screen) {
    const dataListeners = new Set();

    return {
        kill: vi.fn(),
        onData: vi.fn((listener) => {
            dataListeners.add(listener);

            return { dispose: () => dataListeners.delete(listener) };
        }),
        onExit: vi.fn(() => {
            queueMicrotask(() => dataListeners.forEach((listener) => listener(clearScreen(screen))));

            return { dispose: () => {} };
        }),
        write: vi.fn(),
    };
}

describe('runTerminalUsagePoll', () => {
    it('spawns Claude in the requested directory and reads usage off the rendered screen', async () => {
        const processHandle = terminalChild();
        const ptySpawn = vi.fn(() => processHandle);

        const result = await runTerminalUsagePoll(REQUEST, { ptySpawn });

        expect(ptySpawn).toHaveBeenCalledWith('claude.cmd', [], expect.objectContaining({ cwd: '/project', env: REQUEST.env }));
        expect(processHandle.write).toHaveBeenCalledWith('/usage\r');
        expect(processHandle.kill).toHaveBeenCalledOnce();
        expect(result.reason).toBeNull();
        expect(result.payload).toEqual({
            windows: [
                { id: 'five_hour', resetsAt: Date.parse('2026-08-20T13:20:00.000Z'), usedPercent: 1 },
                { id: 'weekly', resetsAt: Date.parse('2026-08-23T17:00:00.000Z'), usedPercent: 12 },
            ],
        });
    });

    it('answers the trust screen once, then waits for the welcome screen and reports usage', async () => {
        const processHandle = trustingChild();

        const result = await runTerminalUsagePoll(REQUEST, { ptySpawn: () => processHandle });

        const trustAnswers = processHandle.write.mock.calls.filter(([data]) => data === '\r');
        expect(trustAnswers).toHaveLength(1);
        expect(processHandle.write).toHaveBeenCalledWith('/usage\r');
        expect(result.payload.windows).toContainEqual(expect.objectContaining({ id: 'weekly', usedPercent: 12 }));
        expect(result.reason).toBeNull();
    });

    it('reports a trust screen that survives its answer, without answering it a second time', async () => {
        const processHandle = trustingChild({ answerLeadsToWelcome: false });

        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 20 },
            { ptySpawn: () => processHandle },
        );

        expect(processHandle.write.mock.calls.filter(([data]) => data === '\r')).toHaveLength(1);
        expect(processHandle.write).not.toHaveBeenCalledWith('/usage\r');
        expect(result.payload).toBeNull();
        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyTrustScreenUnanswered);
        expect(result.screenExcerpt).toContain('Yes, I trust this folder');
    });

    it('ends the poll on a login screen with that reason, before the deadline elapses', async () => {
        const processHandle = stuckChild(LOGIN_SCREEN);

        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 60_000 },
            { ptySpawn: () => processHandle },
        );

        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyLoginRequired);
        expect(processHandle.write).not.toHaveBeenCalled();
        expect(processHandle.kill).toHaveBeenCalledOnce();
    });

    it('ends the poll on an onboarding screen with that reason', async () => {
        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 60_000 },
            { ptySpawn: () => stuckChild(ONBOARDING_SCREEN) },
        );

        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyOnboardingRequired);
    });

    it('names the ready wait when an unrecognised screen never becomes ready', async () => {
        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 20 },
            { ptySpawn: () => stuckChild('Some screen nobody taught this poller about') },
        );

        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker);
        expect(result.screenExcerpt).toContain('Some screen nobody taught this poller about');
    });

    it('names the report wait when /usage went out but no report arrived', async () => {
        const processHandle = terminalChild();
        processHandle.write = vi.fn();

        const result = await runTerminalUsagePoll(
            { ...REQUEST, reportTimeoutMs: 20 },
            { ptySpawn: () => processHandle },
        );

        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyReportTimeout);
        expect(processHandle.kill).toHaveBeenCalledOnce();
    });

    it('bounds the screen excerpt no matter how much Claude printed', async () => {
        const noise = Array.from({ length: 400 }, (_, index) => `noise line ${index}`).join('\n');

        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 20 },
            { ptySpawn: () => stuckChild(noise) },
        );

        expect(result.screenExcerpt.length).toBeLessThanOrEqual(CLAUDE_USAGE_EXCERPT_MAX_CHARS + 1);
    });

    it('reports usage even when killing the already exited pty throws', async () => {
        const processHandle = terminalChild();
        processHandle.kill = vi.fn(() => {
            throw new Error('Cannot kill a pty that has already exited');
        });

        const { payload } = await runTerminalUsagePoll(REQUEST, { ptySpawn: () => processHandle });

        expect(payload.windows).toContainEqual(expect.objectContaining({ id: 'weekly', usedPercent: 12 }));
    });

    it('resolves without usage when the screen never shows a complete report', async () => {
        const result = await runTerminalUsagePoll(REQUEST, { ptySpawn: () => terminalChild('partial', 0) });

        expect(result.payload).toBeNull();
        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyExitedWithoutReport);
    });

    it('keeps the usage left on screen when Claude exits in failure', async () => {
        const { payload } = await runTerminalUsagePoll(REQUEST, { ptySpawn: () => terminalChild(TERMINAL_USAGE_OUTPUT, 1) });

        expect(payload.windows).toContainEqual(expect.objectContaining({ id: 'weekly', usedPercent: 12 }));
    });

    it('rejects with a reason when Claude exits in failure so the caller can mark it unavailable', async () => {
        await expect(runTerminalUsagePoll(REQUEST, { ptySpawn: () => terminalChild('partial', 1) }))
            .rejects.toMatchObject({
                message: 'Claude usage terminal failed',
                reason: CLAUDE_USAGE_POLL_REASONS.ptyFailed,
            });
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

        await expect(poll).resolves.toMatchObject({ payload: null, reason: CLAUDE_USAGE_POLL_REASONS.pollAborted });
        expect(processHandle.kill).toHaveBeenCalledOnce();
    });

    it('sends /usage when a 2.1.241 screen settles on an empty prompt with no legacy phrase', async () => {
        const processHandle = terminalChild(TERMINAL_USAGE_OUTPUT, null, { screen: PROMPT_SCREEN });

        const result = await runTerminalUsagePoll(REQUEST, { ptySpawn: () => processHandle });

        expect(processHandle.write).toHaveBeenCalledWith('/usage\r');
        expect(result.reason).toBeNull();
        expect(result.payload.windows).toContainEqual(expect.objectContaining({ id: 'weekly', usedPercent: 12 }));
    });

    it('sends /usage once no matter how often the prompt screen is redrawn', async () => {
        const processHandle = terminalChild(TERMINAL_USAGE_OUTPUT, null, { redraws: 4, screen: PROMPT_SCREEN });

        await runTerminalUsagePoll(REQUEST, { ptySpawn: () => processHandle });

        expect(processHandle.write.mock.calls.filter(([data]) => data === '/usage\r')).toHaveLength(1);
    });

    it('accepts a settled prompt even when the screen also holds an unrelated `>`', async () => {
        const processHandle = terminalChild(TERMINAL_USAGE_OUTPUT, null, { screen: PROMPT_SCREEN_WITH_STRAY_MARKER });

        const result = await runTerminalUsagePoll(REQUEST, { ptySpawn: () => processHandle });

        expect(processHandle.write).toHaveBeenCalledWith('/usage\r');
        expect(result.reason).toBeNull();
    });

    it('ignores a `>` that sits away from the cursor and lets the ready deadline expire', async () => {
        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 20 },
            { ptySpawn: () => stuckChild(STRAY_MARKER_SCREEN) },
        );

        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker);
    });

    it('ends on a login screen even when it also renders an empty prompt line', async () => {
        const processHandle = stuckChild(LOGIN_SCREEN_WITH_PROMPT);

        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 60_000 },
            { ptySpawn: () => processHandle },
        );

        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyLoginRequired);
        expect(processHandle.write).not.toHaveBeenCalled();
    });

    it('ends on an onboarding screen even when it also renders an empty prompt line', async () => {
        const processHandle = stuckChild(ONBOARDING_SCREEN_WITH_PROMPT);

        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 60_000 },
            { ptySpawn: () => processHandle },
        );

        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyOnboardingRequired);
        expect(processHandle.write).not.toHaveBeenCalled();
    });

    it('answers a trust screen whose cursor rests on its preselected option instead of sending /usage', async () => {
        const processHandle = stuckChild(TRUST_SCREEN_ON_OPTION);

        const result = await runTerminalUsagePoll(
            { ...REQUEST, readyTimeoutMs: 20 },
            { ptySpawn: () => processHandle },
        );

        expect(processHandle.write).toHaveBeenCalledWith('\r');
        expect(processHandle.write).not.toHaveBeenCalledWith('/usage\r');
        expect(result.reason).toBe(CLAUDE_USAGE_POLL_REASONS.ptyTrustScreenUnanswered);
    });
});
