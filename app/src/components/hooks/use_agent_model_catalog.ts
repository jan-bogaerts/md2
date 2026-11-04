import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AgentProfile } from '../../data/agent_profiles';
import {
    agentCapabilitiesService,
    agentCatalogChangedEvent,
    type AgentCapabilitiesService,
} from '../../services/agents/agent_capabilities_service';

/**
 * Subscribe to the shared model list of an agent account; only explicit refresh performs discovery.
 * A missing account ID means the agent's initial account.
 */
export function useAgentModelCatalog(
    profile: AgentProfile | null,
    accountId: string | undefined,
    service: AgentCapabilitiesService = agentCapabilitiesService,
) {
    const agent = profile?.name ?? '';
    const eventName = agentCatalogChangedEvent(agent, accountId);
    const subscribe = useCallback((onStoreChange: () => void) => {
        service.addEventListener(eventName, onStoreChange);

        return () => service.removeEventListener(eventName, onStoreChange);
    }, [eventName, service]);
    const getSnapshot = useCallback(() => service.getCatalogSnapshot(agent, accountId), [accountId, agent, service]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    useEffect(() => {
        if (profile && !snapshot.loading && !snapshot.error && !snapshot.catalog) {
            void service.loadCatalog(profile, accountId);
        }
    }, [accountId, profile, service, snapshot]);
    const refresh = useCallback(async () => {
        if (profile) await service.loadCatalog(profile, accountId, true);
    }, [accountId, profile, service]);

    return { ...snapshot, refresh };
}
