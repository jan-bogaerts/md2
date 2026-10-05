export { validateAgentModelCatalog, findCatalogModel, modelThinkingLevels, modelFastTier, validateCatalogSelection } from '../../../shared/agent_model_catalog.mjs';
export type { AgentModelCatalog, AgentModel, AgentModelServiceTier } from '../../../shared/agent_model_catalog.mjs';
import type { AgentProfile } from './agent_profiles';
import type { ProjectReference } from './data_types';

export interface AgentModelCatalogRequest {
    agent: string;
    profile?: AgentProfile;
    project?: ProjectReference;
    refresh?: boolean;
}
