function usageNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
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
    usage.totalTokens = usage.inputTokens + usage.cachedInputTokens + usage.outputTokens + usage.reasoningTokens
    if (typeof value.costUsd === 'number' && Number.isFinite(value.costUsd) && value.costUsd >= 0) usage.costUsd = value.costUsd

    return usage
}

/** Sum normalized agent token usage records, skipping absent entries; costUsd only appears when a provider reported one. */
export function sumAgentTokenUsage(usages) {
    const total = { cachedInputTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }
    let hasReportedCost = false

    for (const usage of usages) {
        if (!usage) continue

        total.cachedInputTokens += usage.cachedInputTokens
        total.inputTokens += usage.inputTokens
        total.outputTokens += usage.outputTokens
        total.reasoningTokens += usage.reasoningTokens
        total.totalTokens += usage.totalTokens
        if (usage.costUsd !== undefined) {
            total.costUsd = (total.costUsd ?? 0) + usage.costUsd
            hasReportedCost = true
        }
    }
    if (!hasReportedCost) delete total.costUsd

    return total
}
