import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentModelCatalogService } = require('../actions/agent/agent_model_catalog_service');

/** Keep execution validation real while mocking the external catalog discovery boundary. */
export function createAgentModelCatalogStub() {
    const service = new AgentModelCatalogService();
    service.load = vi.fn(async (profile) => ({
        agent: profile.name,
        fetchedAt: Date.now(),
        models: profile.models.map((id) => ({
            displayName: id, hidden: false, id,
            reasoningEfforts: profile.name === 'codex' ? ['low', 'medium', 'high', 'xhigh'] : ['low', 'medium', 'high', 'max'],
            serviceTiers: profile.name === 'codex' ? [{ id: 'priority', name: 'Fast' }] : [],
        })),
        provider: profile.name === 'codex' ? 'openai' : profile.name,
        source: 'runtime',
    }));

    return service;
}
