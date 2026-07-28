const DEFAULT_RATE_LIMIT_ID = 'default';

function nullableString(value) {
    return value === null || typeof value === 'string';
}

function nullableNumber(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function normalizeWindow(window) {
    if (window === null) return null;
    if (!window || typeof window !== 'object' || Array.isArray(window)) return undefined;
    if (typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent)) return undefined;
    if (!nullableNumber(window.windowDurationMins) || !nullableNumber(window.resetsAt)) return undefined;

    return {
        resetsAt: window.resetsAt,
        usedPercent: window.usedPercent,
        windowDurationMins: window.windowDurationMins,
    };
}

function normalizeCredits(credits) {
    if (credits === null) return null;
    if (!credits || typeof credits !== 'object' || Array.isArray(credits)) return undefined;
    if (typeof credits.hasCredits !== 'boolean' || typeof credits.unlimited !== 'boolean') return undefined;
    if (!nullableString(credits.balance)) return undefined;

    return {
        balance: credits.balance,
        hasCredits: credits.hasCredits,
        unlimited: credits.unlimited,
    };
}

function normalizeIndividualLimit(individualLimit) {
    if (individualLimit === null) return null;
    if (!individualLimit || typeof individualLimit !== 'object' || Array.isArray(individualLimit)) return undefined;
    if (typeof individualLimit.limit !== 'string' || typeof individualLimit.used !== 'string') return undefined;
    if (typeof individualLimit.remainingPercent !== 'number' || !Number.isFinite(individualLimit.remainingPercent)) return undefined;
    if (typeof individualLimit.resetsAt !== 'number' || !Number.isFinite(individualLimit.resetsAt)) return undefined;

    return {
        limit: individualLimit.limit,
        remainingPercent: individualLimit.remainingPercent,
        resetsAt: individualLimit.resetsAt,
        used: individualLimit.used,
    };
}

function normalizeBucket(value, fallbackLimitId) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!nullableString(value.limitId) || !nullableString(value.limitName)) return null;
    if (!nullableString(value.planType) || !nullableString(value.rateLimitReachedType)) return null;
    const primary = normalizeWindow(value.primary);
    const secondary = normalizeWindow(value.secondary);
    const credits = normalizeCredits(value.credits);
    const individualLimit = normalizeIndividualLimit(value.individualLimit);
    if (primary === undefined || secondary === undefined || credits === undefined || individualLimit === undefined) return null;

    return {
        credits,
        individualLimit,
        limitId: value.limitId ?? fallbackLimitId ?? DEFAULT_RATE_LIMIT_ID,
        limitName: value.limitName,
        planType: value.planType,
        primary,
        rateLimitReachedType: value.rateLimitReachedType,
        secondary,
    };
}

function normalizeResetCredit(credit) {
    if (!credit || typeof credit !== 'object' || Array.isArray(credit)) return null;
    if (typeof credit.id !== 'string' || typeof credit.resetType !== 'string' || typeof credit.status !== 'string') return null;
    if (typeof credit.grantedAt !== 'number' || !Number.isFinite(credit.grantedAt)) return null;
    if (!nullableNumber(credit.expiresAt) || !nullableString(credit.title) || !nullableString(credit.description)) return null;

    return {
        description: credit.description,
        expiresAt: credit.expiresAt,
        grantedAt: credit.grantedAt,
        id: credit.id,
        resetType: credit.resetType,
        status: credit.status,
        title: credit.title,
    };
}

function normalizeResetCredits(summary) {
    if (summary === null || summary === undefined) return null;
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return undefined;
    if (!Number.isSafeInteger(summary.availableCount) || summary.availableCount < 0) return undefined;
    if (summary.credits !== null && !Array.isArray(summary.credits)) return undefined;
    const credits = summary.credits?.map(normalizeResetCredit) ?? null;
    if (credits?.some((credit) => credit === null)) return undefined;

    return { availableCount: summary.availableCount, credits };
}

function normalizeBuckets(payload) {
    const bucketEntries = payload.rateLimitsByLimitId && typeof payload.rateLimitsByLimitId === 'object'
        && !Array.isArray(payload.rateLimitsByLimitId)
        ? Object.entries(payload.rateLimitsByLimitId)
        : [];
    if (bucketEntries.length > 0) {
        const buckets = bucketEntries.map(([limitId, bucket]) => normalizeBucket(bucket, limitId));

        return buckets.some((bucket) => bucket === null) ? null : buckets;
    }
    const bucket = normalizeBucket(payload.rateLimits, null);

    return bucket ? [bucket] : null;
}

function mergeBucket(current, incoming) {
    if (!current) return incoming;

    return {
        credits: incoming.credits ?? current.credits,
        individualLimit: incoming.individualLimit ?? current.individualLimit,
        limitId: incoming.limitId,
        limitName: incoming.limitName ?? current.limitName,
        planType: incoming.planType ?? current.planType,
        primary: incoming.primary ?? current.primary,
        rateLimitReachedType: incoming.rateLimitReachedType ?? current.rateLimitReachedType,
        secondary: incoming.secondary ?? current.secondary,
    };
}

class CodexRuntimeService {
    constructor() {
        this.listeners = new Set();
        this.snapshot = null;
    }

    getSnapshot() {
        return this.snapshot ? structuredClone(this.snapshot) : null;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        if (this.snapshot) listener(this.getSnapshot());

        return () => this.listeners.delete(listener);
    }

    publishRateLimits(payload, observedAt, sparse = false) {
        if (!Number.isFinite(observedAt)) throw new Error('Invalid Codex rate-limit observation time');
        if (this.snapshot && observedAt < this.snapshot.observedAt) return false;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
        const buckets = normalizeBuckets(payload);
        const resetCredits = normalizeResetCredits(payload.rateLimitResetCredits);
        if (!buckets || resetCredits === undefined) return false;
        const currentBuckets = new Map((this.snapshot?.buckets ?? []).map((bucket) => [bucket.limitId, bucket]));
        if (sparse) {
            for (const bucket of buckets) currentBuckets.set(bucket.limitId, mergeBucket(currentBuckets.get(bucket.limitId), bucket));
        }
        const normalizedBuckets = sparse ? [...currentBuckets.values()] : buckets;
        const rateLimitResetCredits = sparse && resetCredits === null
            ? this.snapshot?.rateLimitResetCredits ?? null
            : resetCredits;
        this.snapshot = {
            available: true,
            buckets: normalizedBuckets,
            observedAt,
            rateLimitResetCredits,
        };
        this.notify();

        return true;
    }

    publishUnavailable(observedAt) {
        if (!Number.isFinite(observedAt)) throw new Error('Invalid Codex rate-limit observation time');
        if (this.snapshot && observedAt < this.snapshot.observedAt) return false;
        this.snapshot = { available: false, buckets: [], observedAt, rateLimitResetCredits: null };
        this.notify();

        return true;
    }

    notify() {
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) listener(snapshot);
    }
}

module.exports = { CodexRuntimeService };
