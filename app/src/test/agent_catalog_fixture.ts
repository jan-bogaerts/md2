import type { AgentModelCatalog } from '../data/agent_model_catalog';
import { mergeAgentProfiles, type AgentProfile } from '../data/agent_profiles';
import type { AgentCatalogSnapshot } from '../services/agents/agent_capabilities_service';

const snapshots = new Map<string, AgentCatalogSnapshot>();
const EMPTY_SNAPSHOT: AgentCatalogSnapshot = { catalog: null, error: null, loading: false, stale: false };

/** Model discovery is mocked at the host boundary; no test launches a client. */
export function agentCatalogFixture(profile: AgentProfile, identifiers: string[] = profile.models): AgentModelCatalog {
    return {
        agent: profile.name,
        fetchedAt: Date.now(),
        models: identifiers.map((id) => ({
            displayName: id,
            hidden: false,
            id,
            reasoningEfforts: profile.name === 'codex' ? ['low', 'medium', 'high', 'xhigh'] : ['low', 'medium', 'high', 'max'],
            serviceTiers: profile.name === 'codex' ? [{ id: 'priority', name: 'Fast' }] : [],
        })),
        provider: profile.name === 'codex' ? 'openai' : profile.name,
        source: profile.name === 'codex' || profile.name === 'claude' ? 'runtime' : 'configured',
    };
}

export function snapshotCatalogFixture(key: string) {
    if (!key) return EMPTY_SNAPSHOT;
    const cached = snapshots.get(key);
    if (cached) return cached;
    const [profile] = JSON.parse(key) as [AgentProfile];
    const snapshot = { catalog: agentCatalogFixture(profile), error: null, loading: false, stale: false };
    snapshots.set(key, snapshot);

    return snapshot;
}

export function codexCatalogFixture(identifiers = ['gpt-6.1-sol']) {
    const profile = mergeAgentProfiles([]).find(({ name }) => name === 'codex');
    if (!profile) throw new Error('Missing test Codex profile');

    return agentCatalogFixture(profile, identifiers);
}
