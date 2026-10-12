export { validateAgentModelCatalog, findCatalogModel } from '../../../shared/agent_model_catalog.mjs';
export type { AgentModelCatalog, AgentModel } from '../../../shared/agent_model_catalog.mjs';
import type { AgentProfile } from './agent_profiles';

export interface AgentModelCatalogRequest {
    agent: string;
    profile?: AgentProfile;
    refresh?: boolean;
}
