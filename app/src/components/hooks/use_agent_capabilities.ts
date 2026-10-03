import { useEffect, useSyncExternalStore } from 'react'
import {
    agentCapabilitiesService,
    type AgentCapabilitiesService,
} from '../../services/agents/agent_capabilities_service'

export function useAgentCapabilities(service: AgentCapabilitiesService = agentCapabilitiesService) {
    useEffect(() => { void service.initialize(); }, [service]);
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
