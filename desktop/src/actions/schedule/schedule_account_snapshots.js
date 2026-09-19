const CLAUDE_LIMIT_ID = 'default';
const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000;

function resetTimestampMilliseconds(agent, resetsAt) {
    if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return null;
    if (agent === 'codex' && resetsAt < UNIX_MILLISECONDS_THRESHOLD) return resetsAt * 1000;

    return resetsAt;
}

function trackerKey(agent, limitId, windowId) {
    return `${agent}\u0000${limitId}\u0000${windowId}`;
}

function codexAccountResetObservations(snapshot) {
    if (!snapshot || snapshot.available !== true || !Array.isArray(snapshot.buckets)) return [];
    const observations = [];
    for (const bucket of snapshot.buckets) {
        if (!bucket || typeof bucket.limitId !== 'string' || bucket.limitId.length === 0) continue;
        for (const windowId of ['primary', 'secondary']) {
            const resetsAt = resetTimestampMilliseconds('codex', bucket[windowId]?.resetsAt);
            if (resetsAt === null) continue;
            observations.push({ agent: 'codex', limitId: bucket.limitId, resetsAt, windowId });
        }
    }

    return observations;
}

function claudeAccountResetObservations(snapshot) {
    if (!snapshot || snapshot.available !== true || !Array.isArray(snapshot.windows)) return [];

    return snapshot.windows.flatMap((window) => {
        if (!window || typeof window.id !== 'string' || window.id.length === 0) return [];
        const resetsAt = resetTimestampMilliseconds('claude', window.resetsAt);
        if (resetsAt === null) return [];

        return [{ agent: 'claude', limitId: CLAUDE_LIMIT_ID, resetsAt, windowId: window.id }];
    });
}

/** Convert provider runtime snapshots into canonical account tracker observations. */
function accountResetObservations(agent, snapshot) {
    if (agent === 'codex') return codexAccountResetObservations(snapshot);
    if (agent === 'claude') return claudeAccountResetObservations(snapshot);

    throw new Error(`Unsupported account reset agent: ${agent}`);
}

module.exports = { accountResetObservations, trackerKey };
