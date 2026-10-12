export interface AgentModel {
    id: string;
    displayName: string;
    description?: string;
    hidden: boolean;
    resolvedModel?: string;
}

export interface AgentModelCatalog {
    agent: string;
    models: AgentModel[];
}

export function validateAgentModelCatalog(value: unknown, source?: string): AgentModelCatalog;
export function findCatalogModel(catalog: AgentModelCatalog, model: string): AgentModel | null;
