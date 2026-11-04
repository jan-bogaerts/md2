import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_AGENT_SELECTION, selectedAgentAccountId } from '../../data/agent_selection'
import { configService } from '../../services/config/config_service'

function subscribeToConfigChanges(onStoreChange: () => void) {
    configService.addEventListener('changed', onStoreChange)

    return () => configService.removeEventListener('changed', onStoreChange)
}

/** Subscribes to the account the desktop selection remembers for an agent; a missing one is the initial account. */
export function useSelectedAgentAccountId(agent: string) {
    const getSnapshot = useCallback(() => {
        const selection = configService.isInitialized() ? configService.get('desktop.agentSelection') : DEFAULT_AGENT_SELECTION

        return selectedAgentAccountId(selection, agent)
    }, [agent])

    return useSyncExternalStore(subscribeToConfigChanges, getSnapshot, getSnapshot)
}
