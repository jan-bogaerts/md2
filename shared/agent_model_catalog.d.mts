export interface AgentModel {
    id: string;
    displayName: string;
    description?: string;
    hidden: boolean;
    resolvedModel?: string;
}

export interface AgentModelCatalog {
    agent: string;
    /** Resolved account the list was discovered with; `null` for agents without accounts. */
    accountId: string | null;
    models: AgentModel[];
}

export function validateAgentModelCatalog(value: unknown, source?: string): AgentModelCatalog;
export function findCatalogModel(catalog: AgentModelCatalog, model: string): AgentModel | null;
