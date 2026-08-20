import type { CodexRateLimitBucket } from '../../data/electron_codex_runtime_bridge'
import type { CodexRateLimitState } from '../../services/agents/codex_rate_limit_service'

const CODEX_RATE_LIMIT_WARNING_PERCENT = 80

export function codexBucketWindows(bucket: CodexRateLimitBucket) {
    return [
        ...(bucket.primary ? [{ label: 'Primary', value: bucket.primary }] : []),
        ...(bucket.secondary ? [{ label: 'Secondary', value: bucket.secondary }] : []),
    ]
}

function bucketHighestUsage(bucket: CodexRateLimitBucket) {
    const percentages = codexBucketWindows(bucket).map(({ value }) => value.usedPercent)

    return percentages.length > 0 ? Math.max(...percentages) : null
}

/** Derives shared visible and attention state without duplicating rate-limit calculations. */
export function codexRateLimitPresentation(state: CodexRateLimitState) {
    const { receivedAt, snapshot, stale } = state
    if (!snapshot?.available || receivedAt === null || stale) return null
    const visibleBuckets = snapshot.buckets.filter((bucket) => codexBucketWindows(bucket).length > 0)
    if (visibleBuckets.length === 0) return null
    const highestUsedPercent = Math.max(...visibleBuckets.map((bucket) => bucketHighestUsage(bucket) ?? 0))
    const reached = visibleBuckets.some(({ rateLimitReachedType }) => !!rateLimitReachedType) || highestUsedPercent >= 100
    const nearLimit = !reached && highestUsedPercent >= CODEX_RATE_LIMIT_WARNING_PERCENT

    return {
        accessibleState: reached ? ', limit reached' : nearLimit ? ', near limit' : '',
        highestUsedPercent,
        nearLimit,
        reached,
        receivedAt,
        snapshot,
        visibleBuckets,
    }
}
