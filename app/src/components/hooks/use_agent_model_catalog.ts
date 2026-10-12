import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AgentProfile } from '../../data/agent_profiles';
import {
    agentCapabilitiesService,
    type AgentCapabilitiesService,
} from '../../services/agents/agent_capabilities_service';

/** Subscribe to the shared model list for an agent; only explicit refresh performs discovery. */
export function useAgentModelCatalog(
    profile: AgentProfile | null,
    service: AgentCapabilitiesService = agentCapabilitiesService,
) {
    const key = profile?.name ?? '';
    const snapshot = useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener(`catalog:${key}`, onStoreChange);

            return () => service.removeEventListener(`catalog:${key}`, onStoreChange);
        },
        () => service.getCatalogSnapshot(key),
        () => service.getCatalogSnapshot(key),
    );
    useEffect(() => {
        if (profile && !snapshot.loading && !snapshot.error && !snapshot.catalog) {
            void service.loadCatalog(profile);
        }
    }, [key, profile, service, snapshot]);
    const refresh = useCallback(async () => {
        if (profile) await service.loadCatalog(profile, true);
    }, [profile, service]);

    return { ...snapshot, refresh };
}
