import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AgentProfile } from '../../data/agent_profiles';
import type { ProjectReference } from '../../data/data_types';
import {
    agentCapabilitiesService,
    agentCatalogKey,
    type AgentCapabilitiesService,
} from '../../services/agents/agent_capabilities_service';

/** Subscribe to one host/profile/worktree catalog; discovery never runs during rendering. */
export function useAgentModelCatalog(
    profile: AgentProfile | null,
    project: ProjectReference | null,
    service: AgentCapabilitiesService = agentCapabilitiesService,
) {
    const key = profile ? agentCatalogKey(profile, project) : '';
    const connection = service.getConnectionIdentity();
    const snapshot = useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener(`catalog:${key}`, onStoreChange);

            return () => service.removeEventListener(`catalog:${key}`, onStoreChange);
        },
        () => service.getCatalogSnapshot(key),
        () => service.getCatalogSnapshot(key),
    );
    useEffect(() => {
        if (profile && !snapshot.loading && !snapshot.error && (!snapshot.catalog || snapshot.stale)) {
            void service.loadCatalog(profile, project, snapshot.stale);
        }
    }, [connection, key, profile, project, service, snapshot]);
    const refresh = useCallback(async () => {
        if (profile) await service.loadCatalog(profile, project, true);
    }, [profile, project, service]);

    return { ...snapshot, refresh };
}
