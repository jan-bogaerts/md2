const RATE_LIMIT_EVENT = 'rateLimits';
const WINDOW_IDS = new Set(['five_hour', 'weekly']);

function normalizeWindow(window) {
    if (!window || typeof window !== 'object' || Array.isArray(window)) return null;
    if (!WINDOW_IDS.has(window.id)) return null;
    if (!Number.isInteger(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100) return null;
    // Claude omits the reset time for a window it has not started; the percentage is still usable.
    if (window.resetsAt !== null && !Number.isFinite(window.resetsAt)) return null;

    return { id: window.id, resetsAt: window.resetsAt ?? null, usedPercent: window.usedPercent };
}

function normalizeWindows(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.windows)) return null;
    const windows = payload.windows.map(normalizeWindow);
    if (windows.some((window) => window === null) || windows.length !== WINDOW_IDS.size) return null;
    if (new Set(windows.map(({ id }) => id)).size !== WINDOW_IDS.size) return null;
    if (!windows.every(({ id }) => WINDOW_IDS.has(id))) return null;

    return windows;
}

function sameWindows(left, right) {
    return left.length === right.length && left.every((window, index) => (
        window.id === right[index].id
        && window.resetsAt === right[index].resetsAt
        && window.usedPercent === right[index].usedPercent
    ));
}

function requireAccountId(accountId) {
    if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Claude rate limits require an account ID');

    return accountId;
}

/** Owns the latest Claude rate-limit snapshot of each agent account in the desktop process. */
class ClaudeRuntimeService {
    constructor() {
        this.events = new EventTarget();
        this.snapshots = new Map();
    }

    getSnapshot(accountId) {
        const snapshot = this.snapshots.get(accountId);

        return snapshot ? structuredClone(snapshot) : null;
    }

    /** Streams every account snapshot; each one names the account it belongs to. */
    subscribe(listener) {
        const handleRateLimits = (event) => listener(event.detail);
        this.events.addEventListener(RATE_LIMIT_EVENT, handleRateLimits);
        for (const accountId of this.snapshots.keys()) listener(this.getSnapshot(accountId));

        return () => this.events.removeEventListener(RATE_LIMIT_EVENT, handleRateLimits);
    }

    publishRateLimits(accountIdValue, payload, observedAt) {
        const accountId = requireAccountId(accountIdValue);
        if (!Number.isFinite(observedAt)) throw new Error('Invalid Claude rate-limit observation time');
        const current = this.snapshots.get(accountId);
        if (current && observedAt < current.observedAt) return false;
        const windows = normalizeWindows(payload);
        if (!windows) return false;
        const changed = !current || !current.available || !sameWindows(current.windows, windows);
        this.snapshots.set(accountId, { accountId, available: true, observedAt, windows });
        if (changed) this.notify(accountId);

        return true;
    }

    publishUnavailable(accountIdValue, observedAt) {
        const accountId = requireAccountId(accountIdValue);
        if (!Number.isFinite(observedAt)) throw new Error('Invalid Claude rate-limit observation time');
        const current = this.snapshots.get(accountId);
        if (current && observedAt < current.observedAt) return false;
        const changed = !current || current.available;
        this.snapshots.set(accountId, { accountId, available: false, observedAt, windows: [] });
        if (changed) this.notify(accountId);

        return true;
    }

    notify(accountId) {
        this.events.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT, { detail: this.getSnapshot(accountId) }));
    }
}

module.exports = { ClaudeRuntimeService };
