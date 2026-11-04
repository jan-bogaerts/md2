import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { claudeRateLimitService, claudeRateLimitsChangedEvent } from '../../services/agents/claude_rate_limit_service'

/** Subscribes to the Claude rate limits of one agent account. */
export function useClaudeRateLimits(accountId: string) {
    const subscribe = useCallback((listener: () => void) => {
        const eventName = claudeRateLimitsChangedEvent(accountId)
        claudeRateLimitService.addEventListener(eventName, listener)

        return () => claudeRateLimitService.removeEventListener(eventName, listener)
    }, [accountId])
    const getSnapshot = useCallback(() => claudeRateLimitService.getState(accountId), [accountId])
    useEffect(() => {
        claudeRateLimitService.requestSnapshot(accountId)
    }, [accountId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
