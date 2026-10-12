import { findCatalogModel, type AgentModelCatalog } from './agent_model_catalog';

export interface AgentModelOption {
    description?: string;
    displayName: string;
    id: string;
}

/** Keep saved identifiers visible without substituting provider aliases or defaults. */
export function agentModelOptions(catalog: AgentModelCatalog | null, selectedModel: string): AgentModelOption[] {
    const options = catalog?.models.filter(({ hidden, id }) => !hidden || id === selectedModel)
        .map(({ id, displayName, description }) => ({ description, displayName, id })) ?? [];
    if (!selectedModel || options.some(({ id }) => id === selectedModel)) return options;
    const advertisedModel = catalog ? findCatalogModel(catalog, selectedModel) : null;

    return [{
        description: advertisedModel?.description,
        displayName: advertisedModel?.displayName ?? selectedModel,
        id: selectedModel,
    }, ...options];
}
