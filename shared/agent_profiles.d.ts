export interface AgentProfile {
    command: string
    defaultModel?: string
    modelArgument?: string
    models?: string[]
    name: string
    resumeCommand?: string
    sessionIdPattern?: string
}

export interface AgentSelection {
    agent: string
    model: string
}

export const MODEL_PLACEHOLDER: string
export const SESSION_ID_PLACEHOLDER: string
export const BUILTIN_AGENT_PROFILES: AgentProfile[]
export function validateAgentProfiles(value: unknown): AgentProfile[]
export function mergeAgentProfiles(profiles: AgentProfile[]): AgentProfile[]
export function findAgentProfile(profiles: AgentProfile[], name: string): AgentProfile | null
export function validateAgentSelection(profiles: AgentProfile[], selection: AgentSelection, source: string): void
export function defaultModelForProfile(profile: AgentProfile): string
export function buildAgentCommand(profile: AgentProfile, model: string): string
export function buildResumeAgentCommand(profile: AgentProfile, sessionId: string): string
