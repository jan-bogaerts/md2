import type { StatsControls, StatsGranularity } from './project_stats_types';

const MILLISECONDS_PER_WEEK = 604_800_000;
const DAYS_PER_WEEK = 7;
const BUCKET_KEY_SEPARATOR = '|';

/** Presentation metadata shared by every row of one UTC bucket. */
export interface StatsBucketContext {
    displayLabel: string;
    end: string;
    interval: string;
    localLabel: string;
    start: string;
}

export function utcBucketStart(timestamp: string, granularity: StatsGranularity) {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    if (granularity === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % DAYS_PER_WEEK));
    if (granularity === 'month') date.setUTCDate(1);

    return date.toISOString();
}

export function nextUtcBucket(timestamp: string, granularity: StatsGranularity) {
    const date = new Date(timestamp);
    if (granularity === 'day') date.setUTCDate(date.getUTCDate() + 1);
    if (granularity === 'week') date.setUTCDate(date.getUTCDate() + DAYS_PER_WEEK);
    if (granularity === 'month') date.setUTCMonth(date.getUTCMonth() + 1);

    return date.toISOString();
}

function isoWeekNumber(timestamp: string) {
    const date = new Date(timestamp);
    date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % DAYS_PER_WEEK));
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));

    return 1 + Math.round((date.getTime() - firstThursday.getTime()) / MILLISECONDS_PER_WEEK);
}

function shortBucketLabel(timestamp: string, granularity: StatsGranularity) {
    const date = new Date(timestamp);
    const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
    if (granularity === 'day') return dayMonth;
    if (granularity === 'week') return `W${isoWeekNumber(timestamp)} - ${dayMonth}`;

    return new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC', year: 'numeric' }).format(date);
}

function localBucketLabel(start: string, end: string) {
    const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

export function inRange(timestamp: string, controls: StatsControls) {
    const milliseconds = Date.parse(timestamp);
    if (controls.startUtc && milliseconds < Date.parse(controls.startUtc)) return false;
    if (controls.endUtc && milliseconds > Date.parse(controls.endUtc)) return false;

    return true;
}

export function bucketDomain(timestamps: string[], granularity: StatsGranularity, controls: StatsControls) {
    const matchingTimestamps = timestamps.filter((timestamp) => inRange(timestamp, controls)).sort();
    const startSource = controls.startUtc ?? matchingTimestamps[0];
    const endSource = controls.endUtc ?? matchingTimestamps.at(-1);
    if (!startSource || !endSource) return [];
    const start = utcBucketStart(startSource, granularity);
    const end = utcBucketStart(endSource, granularity);
    if (start > end) return [];
    const buckets: string[] = [];
    for (let bucket = start; bucket <= end; bucket = nextUtcBucket(bucket, granularity)) buckets.push(bucket);

    return buckets;
}

export function bucketContext(bucket: string, granularity: StatsGranularity): StatsBucketContext {
    const end = nextUtcBucket(bucket, granularity);

    return {
        displayLabel: shortBucketLabel(bucket, granularity),
        end,
        interval: `${bucket} to ${end}`,
        localLabel: localBucketLabel(bucket, end),
        start: bucket,
    };
}

/** Formats each bucket label once per snapshot instead of once per emitted row. */
export function bucketContexts(buckets: string[], granularity: StatsGranularity) {
    return buckets.map((bucket) => bucketContext(bucket, granularity));
}

/** Composite index key; the fixed-format UTC bucket prefix keeps identities unambiguous. */
export function bucketIdentityKey(bucket: string, identity: string) {
    return `${bucket}${BUCKET_KEY_SEPARATOR}${identity}`;
}

/**
 * Groups already range-filtered records by their UTC bucket, preserving input order inside each bucket.
 * Callers read buckets from this index instead of rescanning the full record array per bucket.
 */
export function indexByBucket<T>(items: T[], granularity: StatsGranularity, timestampOf: (item: T) => string) {
    const index = new Map<string, T[]>();
    for (const item of items) {
        const bucket = utcBucketStart(timestampOf(item), granularity);
        const bucketItems = index.get(bucket);
        if (bucketItems) bucketItems.push(item);
        else index.set(bucket, [item]);
    }

    return index;
}

/** Same as {@link indexByBucket} but keyed by bucket and a stable series identity; null identities are skipped. */
export function indexByBucketAndIdentity<T>(
    items: T[],
    granularity: StatsGranularity,
    timestampOf: (item: T) => string,
    identityOf: (item: T) => string | null,
) {
    const index = new Map<string, T[]>();
    for (const item of items) {
        const identity = identityOf(item);
        if (identity === null) continue;
        const key = bucketIdentityKey(utcBucketStart(timestampOf(item), granularity), identity);
        const keyItems = index.get(key);
        if (keyItems) keyItems.push(item);
        else index.set(key, [item]);
    }

    return index;
}
