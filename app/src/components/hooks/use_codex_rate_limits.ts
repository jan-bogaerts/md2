import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { codexRateLimitService, codexRateLimitsChangedEvent } from '../../services/agents/codex_rate_limit_service'

/** Subscribes to the Codex rate limits of one agent account. */
export function useCodexRateLimits(accountId: string) {
    const subscribe = useCallback((listener: () => void) => {
        const eventName = codexRateLimitsChangedEvent(accountId)
        codexRateLimitService.addEventListener(eventName, listener)

        return () => codexRateLimitService.removeEventListener(eventName, listener)
    }, [accountId])
    const getSnapshot = useCallback(() => codexRateLimitService.getState(accountId), [accountId])
    useEffect(() => {
        codexRateLimitService.requestSnapshot(accountId)
    }, [accountId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
