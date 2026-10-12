import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentModelCatalogService } = require('../actions/agent/agent_model_catalog_service');

/** Mock model catalog reads without launching external provider processes. */
export function createAgentModelCatalogStub() {
    const service = new AgentModelCatalogService();
    service.load = vi.fn(async (profile) => ({
        agent: profile.name,
        models: profile.models.map((id) => ({displayName: id, hidden: false, id})),
    }));

    return service;
}
