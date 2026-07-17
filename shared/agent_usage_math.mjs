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
