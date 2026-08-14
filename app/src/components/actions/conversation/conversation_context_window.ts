/** Returns displayed conversation context occupancy as a whole-number percentage. */
export function contextWindowUsedPercent(contextWindowUsage: unknown) {
    if (!contextWindowUsage || typeof contextWindowUsage !== 'object' || Array.isArray(contextWindowUsage)) return null
    const { capacityTokens, usedTokens } = contextWindowUsage as Record<string, unknown>
    if (!Number.isSafeInteger(usedTokens) || (usedTokens as number) < 0) return null
    if (!Number.isSafeInteger(capacityTokens) || (capacityTokens as number) <= 0) return null

    return Math.min(100, Math.round((usedTokens as number) / (capacityTokens as number) * 100))
}
