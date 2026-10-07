import type { AgentModelCatalog } from '../data/agent_model_catalog';
import { mergeAgentProfiles, type AgentProfile } from '../data/agent_profiles';
import type { AgentCatalogSnapshot } from '../services/agents/agent_capabilities_service';

const snapshots = new Map<string, AgentCatalogSnapshot>();
const EMPTY_SNAPSHOT: AgentCatalogSnapshot = { catalog: null, error: null, loading: false };

/** Model discovery is mocked at the host boundary; no test launches a client. */
export function agentCatalogFixture(profile: AgentProfile, identifiers: string[] = profile.models): AgentModelCatalog {
    return {
        agent: profile.name,
        models: identifiers.map((id) => ({
            displayName: id,
            hidden: false,
            id,
        })),
    };
}

export function snapshotCatalogFixture(key: string) {
    if (!key) return EMPTY_SNAPSHOT;
    const cached = snapshots.get(key);
    if (cached) return cached;
    const profile = mergeAgentProfiles([]).find(({ name }) => name === key);
    if (!profile) throw new Error(`Missing test agent ${key}`);
    const snapshot = { catalog: agentCatalogFixture(profile), error: null, loading: false };
    snapshots.set(key, snapshot);

    return snapshot;
}

export function codexCatalogFixture(identifiers = ['gpt-6.1-sol']) {
    const profile = mergeAgentProfiles([]).find(({ name }) => name === 'codex');
    if (!profile) throw new Error('Missing test Codex profile');

    return agentCatalogFixture(profile, identifiers);
}
