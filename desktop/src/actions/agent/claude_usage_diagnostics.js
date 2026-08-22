const CLAUDE_USAGE_EXCERPT_MAX_CHARS = 600;
const CLAUDE_USAGE_EXCERPT_MAX_LINES = 12;
const CLAUDE_USAGE_LOG_TAG = '[claude:usage-poll]';

/**
 * Why a `/usage` poll produced no report. Each value names one failure path, so a console record
 * identifies which of them ran without needing the surrounding code.
 */
const CLAUDE_USAGE_POLL_REASONS = Object.freeze({
    hostDeadline: 'pty-host-deadline',
    ptyExitedWithoutReport: 'pty-exited-without-report',
    ptyFailed: 'pty-claude-failed',
    ptyLoginRequired: 'pty-login-required',
    ptyNoReadyMarker: 'pty-no-ready-marker',
    ptyOnboardingRequired: 'pty-onboarding-required',
    ptyReportTimeout: 'pty-report-timeout',
    ptyTrustScreenUnanswered: 'pty-trust-screen-unanswered',
    pollAborted: 'poll-aborted',
    runtimeListenerFailed: 'runtime-listener-failed',
    stdoutSpawnFailed: 'stdout-spawn-failed',
    stdoutUnparsed: 'stdout-unparsed',
    workerExitedWithoutReply: 'pty-worker-exited-without-reply',
    workerForkFailed: 'pty-worker-fork-failed',
});

// A failed poll repeats on an interval, so these reasons say "this run is broken" rather than "this
// attempt found nothing", and are the only ones worth an error-level record.
const CLAUDE_USAGE_ERROR_REASONS = new Set([
    CLAUDE_USAGE_POLL_REASONS.ptyFailed,
    CLAUDE_USAGE_POLL_REASONS.ptyLoginRequired,
    CLAUDE_USAGE_POLL_REASONS.ptyOnboardingRequired,
    CLAUDE_USAGE_POLL_REASONS.stdoutSpawnFailed,
    CLAUDE_USAGE_POLL_REASONS.runtimeListenerFailed,
    CLAUDE_USAGE_POLL_REASONS.workerForkFailed,
]);

/**
 * Keeps the tail of what Claude last showed, which is the part that says why a screen went
 * unrecognised. Bounded in both lines and characters: this runs on a repeating interval, and a full
 * screen dump per poll would bury the console.
 */
function usageScreenExcerpt(text) {
    if (typeof text !== 'string' || text.length === 0) return '';
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    const tail = lines.slice(-CLAUDE_USAGE_EXCERPT_MAX_LINES).join('\n');
    if (tail.length <= CLAUDE_USAGE_EXCERPT_MAX_CHARS) return tail;

    return `…${tail.slice(-CLAUDE_USAGE_EXCERPT_MAX_CHARS)}`;
}

/** Writes exactly one console record per failed attempt; callers log at most one per attempt. */
function logUsagePollFailure({ attempt, cwd, elapsedMs, error, executable, reason, screenExcerpt }) {
    const record = {
        attempt,
        cwd,
        elapsedMs,
        executable,
        reason,
        timestamp: new Date().toISOString(),
    };
    if (error) record.error = error instanceof Error ? error.message : String(error);
    if (screenExcerpt) record.screenExcerpt = screenExcerpt;
    if (CLAUDE_USAGE_ERROR_REASONS.has(reason)) console.error(CLAUDE_USAGE_LOG_TAG, record);
    else console.warn(CLAUDE_USAGE_LOG_TAG, record);
}

module.exports = {
    CLAUDE_USAGE_EXCERPT_MAX_CHARS,
    CLAUDE_USAGE_LOG_TAG,
    CLAUDE_USAGE_POLL_REASONS,
    logUsagePollFailure,
    usageScreenExcerpt,
};
