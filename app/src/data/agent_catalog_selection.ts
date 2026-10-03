import { validateCatalogSelection, type AgentModelCatalog } from './agent_model_catalog';
import type { AgentSelection } from './agent_profiles';

/** Report runtime selection conflicts without throwing during React rendering. */
export function agentCatalogSelectionError(catalog: AgentModelCatalog | null, selection: AgentSelection) {
    if (!catalog) return null;
    try {
        validateCatalogSelection(catalog, selection);

        return null;
    } catch (error) {
        return error instanceof Error ? error.message : 'Invalid model capabilities';
    }
}
