import { useSyncExternalStore } from 'react'
import { codexRateLimitService } from '../../services/agents/codex_rate_limit_service'

export function useCodexRateLimits() {
    return useSyncExternalStore(
        (listener) => {
            codexRateLimitService.addEventListener('changed', listener)

            return () => codexRateLimitService.removeEventListener('changed', listener)
        },
        () => codexRateLimitService.getState(),
        () => codexRateLimitService.getState(),
    )
}
