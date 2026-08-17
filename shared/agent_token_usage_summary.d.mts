import type { AgentTokenUsage } from '../app/src/data/data_types.ts'

export interface AgentSummaryUsage extends AgentTokenUsage {
    legacyTotalTokens: number
}

export interface AgentTokenUsageSummary {
    projectUsage: AgentSummaryUsage
    releases: Record<string, AgentSummaryUsage>
    schemaVersion: 1
}

export const AGENT_TOKEN_USAGE_SCHEMA_VERSION: 1
export const AGENT_TOKEN_USAGE_FILE_NAME: 'agent_token_usage.json'
export function emptySummaryUsage(): AgentSummaryUsage
export function legacySummaryUsage(totalTokens: number, costUsd?: number): AgentSummaryUsage
export function correctedSummaryUsage(usage: AgentTokenUsage): AgentSummaryUsage
export function addSummaryUsage(usages: AgentSummaryUsage[]): AgentSummaryUsage
export function createAgentTokenUsageSummary(
    projectUsage?: AgentSummaryUsage,
    releases?: Record<string, AgentSummaryUsage>,
): AgentTokenUsageSummary
export function agentTokenUsageFilePath(projectFolder: string): string
export function parseSummaryUsage(value: unknown, fieldName: string): AgentSummaryUsage
export function parseAgentTokenUsageSummary(content: string): AgentTokenUsageSummary
export function serializeAgentTokenUsageSummary(summary: AgentTokenUsageSummary): string
