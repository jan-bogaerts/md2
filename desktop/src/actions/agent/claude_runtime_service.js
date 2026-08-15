const RATE_LIMIT_EVENT = 'rateLimits';
const WINDOW_IDS = new Set(['five_hour', 'weekly']);

function normalizeWindow(window) {
    if (!window || typeof window !== 'object' || Array.isArray(window)) return null;
    if (!WINDOW_IDS.has(window.id)) return null;
    if (!Number.isInteger(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100) return null;
    if (!Number.isFinite(window.resetsAt)) return null;

    return { id: window.id, resetsAt: window.resetsAt, usedPercent: window.usedPercent };
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

/** Owns latest account-wide Claude rate-limit snapshot in desktop process. */
class ClaudeRuntimeService {
    constructor() {
        this.events = new EventTarget();
        this.snapshot = null;
    }

    getSnapshot() {
        return this.snapshot ? structuredClone(this.snapshot) : null;
    }

    subscribe(listener) {
        const handleRateLimits = (event) => listener(event.detail);
        this.events.addEventListener(RATE_LIMIT_EVENT, handleRateLimits);
        if (this.snapshot) listener(this.getSnapshot());

        return () => this.events.removeEventListener(RATE_LIMIT_EVENT, handleRateLimits);
    }

    publishRateLimits(payload, observedAt) {
        if (!Number.isFinite(observedAt)) throw new Error('Invalid Claude rate-limit observation time');
        if (this.snapshot && observedAt < this.snapshot.observedAt) return false;
        const windows = normalizeWindows(payload);
        if (!windows) return false;
        const changed = !this.snapshot || !this.snapshot.available || !sameWindows(this.snapshot.windows, windows);
        this.snapshot = { available: true, observedAt, windows };
        if (changed) this.notify();

        return true;
    }

    publishUnavailable(observedAt) {
        if (!Number.isFinite(observedAt)) throw new Error('Invalid Claude rate-limit observation time');
        if (this.snapshot && observedAt < this.snapshot.observedAt) return false;
        const changed = !this.snapshot || this.snapshot.available;
        this.snapshot = { available: false, observedAt, windows: [] };
        if (changed) this.notify();

        return true;
    }

    notify() {
        this.events.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT, { detail: this.getSnapshot() }));
    }
}

module.exports = { ClaudeRuntimeService };
