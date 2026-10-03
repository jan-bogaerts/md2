import type { ThinkingLevel, SpeedMode } from './agent_profiles.mjs';

export interface AgentModelServiceTier {
    id: string;
    name: string;
    description?: string;
}

export interface AgentModel {
    id: string;
    displayName: string;
    description?: string;
    hidden: boolean;
    resolvedModel?: string;
    reasoningEfforts: string[] | null;
    serviceTiers: AgentModelServiceTier[];
}

export interface AgentModelCatalog {
    agent: string;
    provider: string;
    source: 'runtime' | 'configured';
    fetchedAt: number;
    executable?: string;
    models: AgentModel[];
}

export function validateAgentModelCatalog(value: unknown, source?: string): AgentModelCatalog;
export function findCatalogModel(catalog: AgentModelCatalog, model: string): AgentModel | null;
export function modelThinkingLevels(agent: string, model: AgentModel | null): ThinkingLevel[];
export function modelFastTier(catalog: AgentModelCatalog, model: AgentModel | null): AgentModelServiceTier | null;
export function validateCatalogSelection(catalog: AgentModelCatalog, selection: {
    model: string;
    thinkingLevel?: ThinkingLevel;
    speedMode?: SpeedMode;
}, source?: string): {model: AgentModel; serviceTier: string | undefined};
