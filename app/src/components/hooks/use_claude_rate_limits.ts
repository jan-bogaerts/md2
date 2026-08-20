import { useSyncExternalStore } from 'react'
import { claudeRateLimitService } from '../../services/agents/claude_rate_limit_service'

export function useClaudeRateLimits() {
    return useSyncExternalStore(
        (listener) => {
            claudeRateLimitService.addEventListener('changed', listener)

            return () => claudeRateLimitService.removeEventListener('changed', listener)
        },
        () => claudeRateLimitService.getState(),
        () => claudeRateLimitService.getState(),
    )
}
