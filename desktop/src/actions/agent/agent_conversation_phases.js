const {
    isTerminalProviderEventStatus,
    providerEventCategory,
} = require('../../../../shared/agent_event_categories.mjs');

const EMPTY_DELTA = { reasoningMs: 0, toolMs: 0 };

/**
 * Run-scoped tracker of how the measured wall clock was spent. `open` holds one span per in-flight
 * `providerItemId`, `closed` the spans that finished inside the running period being measured, and
 * `applied` how much of that period has already been folded into the conversation timer, so a live
 * fold and the fold at a status transition can never charge the same millisecond twice.
 */
function createPhaseTracker() {
    return { applied: { reasoningMs: 0, toolMs: 0 }, closed: [], open: new Map() };
}

/**
 * Drives the tracker from one provider event. Returns true when this event closed a span, which is
 * the moment the caller may refresh the live breakdown.
 */
function recordPhaseEvent(tracker, providerEvent, timestamp) {
    if (!tracker) return false;
    const category = providerEventCategory(providerEvent.type);
    if (!category) return false;
    const providerItemId = providerEvent.providerItemId;
    if (typeof providerItemId !== 'string' || providerItemId.length === 0) return false;
    const atMs = Date.parse(timestamp);
    if (Number.isNaN(atMs)) return false;
    const openSpan = tracker.open.get(providerItemId);

    if (isTerminalProviderEventStatus(providerEvent.status)) {
        // A first event that is already terminal never ran inside a measurable span, so it is agent time.
        if (!openSpan) return false;
        tracker.open.delete(providerItemId);
        if (openSpan.startMs === null) return false;
        tracker.closed.push({ category: openSpan.category, endMs: Math.max(atMs, openSpan.startMs), startMs: openSpan.startMs });

        return true;
    }
    if (!openSpan) tracker.open.set(providerItemId, { category, startMs: atMs });

    return false;
}

function mergedIntervals(intervals) {
    const sorted = [...intervals].sort((left, right) => left.startMs - right.startMs);
    const merged = [];
    for (const interval of sorted) {
        if (interval.endMs <= interval.startMs) continue;
        const previous = merged.at(-1);
        if (previous && interval.startMs <= previous.endMs) {
            previous.endMs = Math.max(previous.endMs, interval.endMs);
            continue;
        }
        merged.push({ endMs: interval.endMs, startMs: interval.startMs });
    }

    return merged;
}

function totalLength(intervals) {
    return intervals.reduce((total, { endMs, startMs }) => total + (endMs - startMs), 0);
}

/** Length of `intervals` that no interval in `subtrahend` covers; both must already be merged. */
function lengthOutside(intervals, subtrahend) {
    let total = 0;
    for (const interval of intervals) {
        let cursor = interval.startMs;
        for (const blocker of subtrahend) {
            if (blocker.endMs <= cursor) continue;
            if (blocker.startMs >= interval.endMs) break;
            if (blocker.startMs > cursor) total += blocker.startMs - cursor;
            cursor = Math.max(cursor, blocker.endMs);
            if (cursor >= interval.endMs) break;
        }
        if (cursor < interval.endMs) total += interval.endMs - cursor;
    }

    return total;
}

function clippedIntervals(intervals, category, fromMs, toMs) {
    return intervals.flatMap((interval) => {
        if (interval.category !== category) return [];
        const startMs = Math.max(interval.startMs, fromMs);
        const endMs = Math.min(interval.endMs, toMs);

        return endMs > startMs ? [{ endMs, startMs }] : [];
    });
}

/**
 * Union of the closed spans clipped to one running period. Tools and reasoning overlap when a
 * sub-agent thread reasons while another tool runs, so the overlap is charged to tools and every
 * millisecond is counted exactly once: the components can never add up past the wall clock.
 */
function phaseTotals(tracker, fromMs, toMs) {
    const toolIntervals = mergedIntervals(clippedIntervals(tracker.closed, 'tool', fromMs, toMs));
    const reasoningIntervals = mergedIntervals(clippedIntervals(tracker.closed, 'reasoning', fromMs, toMs));

    return { reasoningMs: lengthOutside(reasoningIntervals, toolIntervals), toolMs: totalLength(toolIntervals) };
}

/**
 * How much to add to the timer breakdown right now, given everything already added for this running
 * period. Recomputing the whole union and subtracting what was applied keeps repeated folds exact.
 */
function foldPhases(tracker, fromMs, toMs) {
    if (!tracker || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return EMPTY_DELTA;
    const totals = phaseTotals(tracker, fromMs, toMs);
    const delta = {
        reasoningMs: Math.max(0, totals.reasoningMs - tracker.applied.reasoningMs),
        toolMs: Math.max(0, totals.toolMs - tracker.applied.toolMs),
    };
    tracker.applied = totals;

    return delta;
}

/**
 * Closes every in-flight span at the moment the run stops being measured and leaves it open for a
 * later resume, so a tool parked on its approval contributes only the time it actually worked.
 */
function suspendPhases(tracker, atMs) {
    if (!tracker || !Number.isFinite(atMs)) return;
    for (const span of tracker.open.values()) {
        if (span.startMs === null) continue;
        if (atMs > span.startMs) tracker.closed.push({ category: span.category, endMs: atMs, startMs: span.startMs });
        span.startMs = null;
    }
}

/** Restarts the spans suspended at the previous transition. */
function resumePhases(tracker, atMs) {
    if (!tracker || !Number.isFinite(atMs)) return;
    for (const span of tracker.open.values()) {
        if (span.startMs === null) span.startMs = atMs;
    }
}

/** Drops the folded period so the next running period starts from an empty union. */
function resetPhasePeriod(tracker) {
    if (!tracker) return;
    tracker.applied = { reasoningMs: 0, toolMs: 0 };
    tracker.closed = [];
}

/** Adds a fold delta to a timer, leaving a timer that gained nothing byte-identical. */
function addTimerBreakdown(timer, delta) {
    if (!timer) return timer;
    const current = timer.breakdown ?? { reasoningMs: 0, toolMs: 0 };
    const breakdown = { reasoningMs: current.reasoningMs + delta.reasoningMs, toolMs: current.toolMs + delta.toolMs };
    if (timer.breakdown
        && breakdown.reasoningMs === timer.breakdown.reasoningMs
        && breakdown.toolMs === timer.breakdown.toolMs) return timer;

    return { ...timer, breakdown };
}

module.exports = {
    addTimerBreakdown,
    createPhaseTracker,
    foldPhases,
    phaseTotals,
    recordPhaseEvent,
    resetPhasePeriod,
    resumePhases,
    suspendPhases,
};
