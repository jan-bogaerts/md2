import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    CLAUDE_USAGE_EXCERPT_MAX_CHARS,
    CLAUDE_USAGE_LOG_TAG,
    CLAUDE_USAGE_POLL_REASONS,
    logUsagePollFailure,
    usageScreenExcerpt,
} = require('./claude_usage_diagnostics');

describe('usageScreenExcerpt', () => {
    it('keeps the tail of the screen, which is the part that says why it went unrecognised', () => {
        const screen = 'first line\n\nmiddle line\nlast line';

        expect(usageScreenExcerpt(screen)).toBe('first line\nmiddle line\nlast line');
    });

    it('bounds a long screen in characters and marks that it was cut', () => {
        const excerpt = usageScreenExcerpt('x'.repeat(10_000));

        expect(excerpt).toHaveLength(CLAUDE_USAGE_EXCERPT_MAX_CHARS + 1);
        expect(excerpt.startsWith('…')).toBe(true);
    });

    it('bounds a screen made of many short lines', () => {
        const screen = Array.from({ length: 500 }, (_, index) => `line ${index}`).join('\n');

        expect(usageScreenExcerpt(screen).length).toBeLessThanOrEqual(CLAUDE_USAGE_EXCERPT_MAX_CHARS + 1);
        expect(usageScreenExcerpt(screen)).toContain('line 499');
    });

    it('returns nothing for an empty or absent screen', () => {
        expect(usageScreenExcerpt('')).toBe('');
        expect(usageScreenExcerpt(undefined)).toBe('');
    });
});

describe('logUsagePollFailure', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('writes one warning carrying the attempt, folder, executable, elapsed time and reason', () => {
        logUsagePollFailure({
            attempt: 'pty',
            cwd: 'C:/projects/md2',
            elapsedMs: 31_400,
            executable: 'C:/tools/claude.cmd',
            reason: CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker,
            screenExcerpt: 'some screen',
        });

        expect(console.error).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledOnce();
        expect(console.warn).toHaveBeenCalledWith(CLAUDE_USAGE_LOG_TAG, expect.objectContaining({
            attempt: 'pty',
            cwd: 'C:/projects/md2',
            elapsedMs: 31_400,
            executable: 'C:/tools/claude.cmd',
            reason: CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker,
            screenExcerpt: 'some screen',
        }));
    });

    it('raises a broken Claude to error level and keeps the message that came with it', () => {
        logUsagePollFailure({
            attempt: 'stdout',
            error: new Error('spawn ENOENT'),
            reason: CLAUDE_USAGE_POLL_REASONS.stdoutSpawnFailed,
        });

        expect(console.warn).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledOnce();
        expect(console.error.mock.calls[0][1]).toMatchObject({ error: 'spawn ENOENT' });
    });

    it('leaves out the error and the excerpt when there are none', () => {
        logUsagePollFailure({ attempt: 'stdout', reason: CLAUDE_USAGE_POLL_REASONS.stdoutUnparsed });

        const [, record] = console.warn.mock.calls[0];
        expect(record).not.toHaveProperty('error');
        expect(record).not.toHaveProperty('screenExcerpt');
    });

    it('gives every failure path its own reason', () => {
        const reasons = Object.values(CLAUDE_USAGE_POLL_REASONS);

        expect(new Set(reasons).size).toBe(reasons.length);
    });
});
