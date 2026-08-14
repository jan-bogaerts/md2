const DEFAULT_RATE_LIMIT_ID = 'default';
const RATE_LIMIT_EVENT = 'rateLimits';
const UPDATE_REQUIRED_EVENT = 'updateRequired';

function nullableString(value) {
    return value === undefined || value === null || typeof value === 'string';
}

function nullableNumber(value) {
    return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value));
}

function normalizeWindow(window) {
    if (window === undefined) return undefined;
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
    if (credits === undefined) return undefined;
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
    if (individualLimit === undefined) return undefined;
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
    const hasInvalidField = (value.primary !== undefined && primary === undefined)
        || (value.secondary !== undefined && secondary === undefined)
        || (value.credits !== undefined && credits === undefined)
        || (value.individualLimit !== undefined && individualLimit === undefined);
    if (hasInvalidField) return null;
    const hasLimitData = fallbackLimitId !== null
        || Object.values(value).some((field) => field !== undefined && field !== null);
    if (!hasLimitData) return null;

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

function completeWindow(window) {
    if (!window) return null;

    return {
        resetsAt: window.resetsAt ?? null,
        usedPercent: window.usedPercent,
        windowDurationMins: window.windowDurationMins ?? null,
    };
}

function completeBucket(bucket) {
    return {
        credits: bucket.credits ?? null,
        individualLimit: bucket.individualLimit ?? null,
        limitId: bucket.limitId,
        limitName: bucket.limitName ?? null,
        planType: bucket.planType ?? null,
        primary: completeWindow(bucket.primary),
        rateLimitReachedType: bucket.rateLimitReachedType ?? null,
        secondary: completeWindow(bucket.secondary),
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

function mergeWindow(current, incoming) {
    if (!incoming) return current;
    if (!current) return incoming;

    return {
        resetsAt: incoming.resetsAt ?? current.resetsAt,
        usedPercent: incoming.usedPercent,
        windowDurationMins: incoming.windowDurationMins ?? current.windowDurationMins,
    };
}

function mergeBucket(current, incoming) {
    if (!current) return incoming;

    return {
        credits: incoming.credits ?? current.credits,
        individualLimit: incoming.individualLimit ?? current.individualLimit,
        limitId: incoming.limitId,
        limitName: incoming.limitName ?? current.limitName,
        planType: incoming.planType ?? current.planType,
        primary: mergeWindow(current.primary, incoming.primary),
        rateLimitReachedType: incoming.rateLimitReachedType ?? current.rateLimitReachedType,
        secondary: mergeWindow(current.secondary, incoming.secondary),
    };
}

class CodexRuntimeService {
    constructor() {
        this.events = new EventTarget();
        this.publishedUpdateMismatches = new Set();
        this.snapshot = null;
        this.updateRequiredSnapshot = null;
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

    subscribeUpdateRequired(listener) {
        const handleUpdateRequired = (event) => listener(event.detail);
        this.events.addEventListener(UPDATE_REQUIRED_EVENT, handleUpdateRequired);
        if (this.updateRequiredSnapshot) listener(structuredClone(this.updateRequiredSnapshot));

        return () => this.events.removeEventListener(UPDATE_REQUIRED_EVENT, handleUpdateRequired);
    }

    publishUpdateRequired(runningVersion, cacheVersion) {
        if (typeof runningVersion !== 'string' || runningVersion.length === 0) {
            throw new Error('Running Codex version is required');
        }
        if (typeof cacheVersion !== 'string' || cacheVersion.length === 0) {
            throw new Error('Codex cache client version is required');
        }
        const mismatchKey = `${runningVersion}\u0000${cacheVersion}`;
        if (this.publishedUpdateMismatches.has(mismatchKey)) return false;

        this.publishedUpdateMismatches.add(mismatchKey);
        this.updateRequiredSnapshot = { cacheVersion, runningVersion };
        this.events.dispatchEvent(new CustomEvent(UPDATE_REQUIRED_EVENT, {detail: structuredClone(this.updateRequiredSnapshot)}));

        return true;
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
        const normalizedBuckets = (sparse ? [...currentBuckets.values()] : buckets).map(completeBucket);
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
        this.events.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT, { detail: snapshot }));
    }
}

module.exports = { CodexRuntimeService };
