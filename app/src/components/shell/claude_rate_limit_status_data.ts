import type { ClaudeRateLimitState } from '../../services/agents/claude_rate_limit_service'

const CLAUDE_RATE_LIMIT_WARNING_PERCENT = 80

/** Derives Claude usage visibility and attention state for both status surfaces. */
export function claudeRateLimitPresentation(state: ClaudeRateLimitState) {
    const { receivedAt, snapshot, stale } = state
    if (!snapshot?.available || receivedAt === null || stale || snapshot.windows.length === 0) return null
    const highestUsedPercent = Math.max(...snapshot.windows.map(({ usedPercent }) => usedPercent))
    const reached = highestUsedPercent >= 100
    const nearLimit = !reached && highestUsedPercent >= CLAUDE_RATE_LIMIT_WARNING_PERCENT

    return {
        accessibleState: reached ? ', limit reached' : nearLimit ? ', near limit' : '',
        highestUsedPercent,
        nearLimit,
        reached,
        receivedAt,
        snapshot,
    }
}
