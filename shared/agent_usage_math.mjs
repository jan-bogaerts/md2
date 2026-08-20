function usageNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function requireUsageNumber(value, fieldName) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid provider token usage ${fieldName}`)
    }

    return value
}

/**
 * Coerce a provider usage record into the shape `sumAgentTokenUsage` relies on: five finite
 * non-negative counters plus an optional `costUsd`. `totalTokens` is always recomputed from the
 * buckets rather than trusted, so provider totals can never disagree with their own parts.
 */
export function normalizeAgentTokenUsage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    const usage = {
        cachedInputTokens: usageNumber(value.cachedInputTokens),
        inputTokens: usageNumber(value.inputTokens),
        outputTokens: usageNumber(value.outputTokens),
        reasoningTokens: usageNumber(value.reasoningTokens),
    }
    if (value.legacyTotalTokens !== undefined) usage.legacyTotalTokens = usageNumber(value.legacyTotalTokens)
    usage.totalTokens = (usage.legacyTotalTokens ?? 0)
        + usage.inputTokens
        + usage.cachedInputTokens
        + usage.outputTokens
        + usage.reasoningTokens
    if (typeof value.costUsd === 'number' && Number.isFinite(value.costUsd) && value.costUsd >= 0) usage.costUsd = value.costUsd

    return usage
}

/** Validate disjoint usage buckets emitted for one newly completed provider turn. */
export function validateAgentTokenUsage(value, providerTotalTokens) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid provider token usage')
    }
    const usage = {
        cachedInputTokens: requireUsageNumber(value.cachedInputTokens, 'cachedInputTokens'),
        inputTokens: requireUsageNumber(value.inputTokens, 'inputTokens'),
        outputTokens: requireUsageNumber(value.outputTokens, 'outputTokens'),
        reasoningTokens: requireUsageNumber(value.reasoningTokens, 'reasoningTokens'),
    }
    usage.totalTokens = usage.inputTokens + usage.cachedInputTokens + usage.outputTokens + usage.reasoningTokens
    if (providerTotalTokens !== undefined) {
        const totalTokens = requireUsageNumber(providerTotalTokens, 'totalTokens')
        if (usage.totalTokens !== totalTokens) {
            throw new Error(`Inconsistent provider token usage total: expected ${totalTokens}, received ${usage.totalTokens}`)
        }
    }
    if (value.costUsd !== undefined) usage.costUsd = requireUsageNumber(value.costUsd, 'costUsd')

    return usage
}

/** Sum normalized agent token usage records, skipping absent entries; costUsd only appears when a provider reported one. */
export function sumAgentTokenUsage(usages) {
    const total = { cachedInputTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }
    let hasReportedCost = false
    let hasLegacyTotal = false

    for (const usage of usages) {
        if (!usage) continue

        total.cachedInputTokens += usage.cachedInputTokens
        total.inputTokens += usage.inputTokens
        total.outputTokens += usage.outputTokens
        total.reasoningTokens += usage.reasoningTokens
        total.totalTokens += usage.totalTokens
        if (usage.legacyTotalTokens !== undefined) {
            total.legacyTotalTokens = (total.legacyTotalTokens ?? 0) + usage.legacyTotalTokens
            hasLegacyTotal = true
        }
        if (usage.costUsd !== undefined) {
            total.costUsd = (total.costUsd ?? 0) + usage.costUsd
            hasReportedCost = true
        }
    }
    if (!hasReportedCost) delete total.costUsd
    if (!hasLegacyTotal) delete total.legacyTotalTokens

    return total
}
