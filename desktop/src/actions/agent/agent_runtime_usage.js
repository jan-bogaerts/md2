/**
 * Publishes one Codex runtime event to the snapshot of the account that produced it.
 *
 * Usage observed while working (a run, a repeating poll) is recorded in the project metrics. An
 * initial observation is not recorded, and a payload it cannot use marks the account unavailable.
 */
async function publishCodexRuntimeEvent(services, accountId, event, recordUsage) {
    const { codexRuntimeService, usageMetricsService } = services;
    if (!codexRuntimeService) return;
    if (event.kind === 'unavailable') {
        codexRuntimeService.publishUnavailable(accountId, event.observedAt);
        return;
    }
    const accepted = codexRuntimeService.publishRateLimits(accountId, event.payload, event.observedAt, event.kind === 'update');
    if (!recordUsage) {
        if (!accepted) codexRuntimeService.publishUnavailable(accountId, event.observedAt);
        return;
    }
    if (!accepted || !usageMetricsService) return;
    await usageMetricsService.recordAccountUsage('codex', codexRuntimeService.getSnapshot(accountId));
}

/** Publishes one Claude runtime event to the snapshot of the account that produced it; see the Codex variant. */
async function publishClaudeRuntimeEvent(services, accountId, event, recordUsage) {
    const { claudeRuntimeService, usageMetricsService } = services;
    if (!claudeRuntimeService) return;
    if (event.kind === 'unavailable') {
        claudeRuntimeService.publishUnavailable(accountId, event.observedAt);
        return;
    }
    const accepted = claudeRuntimeService.publishRateLimits(accountId, event.payload, event.observedAt);
    if (!recordUsage) {
        if (!accepted) claudeRuntimeService.publishUnavailable(accountId, event.observedAt);
        return;
    }
    if (!accepted || !usageMetricsService) return;
    await usageMetricsService.recordAccountUsage('claude', claudeRuntimeService.getSnapshot(accountId));
}

module.exports = { publishClaudeRuntimeEvent, publishCodexRuntimeEvent };
