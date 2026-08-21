export interface AgentProfile {
    command: string[]
    defaultModel?: string
    defaultThinkingLevel: ThinkingLevel
    modelArgument?: string
    models: string[]
    name: string
    resumeCommand?: string[]
}

export interface AgentSelection {
    agent: string
    model: string
    permissionMode?: PermissionMode | ''
    thinkingLevel?: ThinkingLevel
}

export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'max'
export type PermissionMode = 'ask-for-approval' | 'approve-for-me' | 'full-access'
export interface PermissionModeOption {
    description: string
    label: string
    value: PermissionMode
}

export const MODEL_PLACEHOLDER: string
export const SESSION_ID_PLACEHOLDER: string
export const THINKING_LEVELS: ThinkingLevel[]
export const PERMISSION_MODES: PermissionMode[]
export const DEFAULT_PERMISSION_MODE: PermissionMode
export const PERMISSION_MODE_OPTIONS: PermissionModeOption[]
export const BUILTIN_AGENT_PROFILES: AgentProfile[]
export function validateAgentProfiles(value: unknown): AgentProfile[]
export function migrateAgentProfiles(value: unknown): unknown
export function normalizeAgentProfiles(value: unknown): AgentProfile[]
export function mergeAgentProfiles(profiles: AgentProfile[]): AgentProfile[]
export function findAgentProfile(profiles: AgentProfile[], name: string): AgentProfile | null
export function validateAgentSelection(profiles: AgentProfile[], selection: AgentSelection, source: string): void
export function validateThinkingLevel(value: unknown, source: string): ThinkingLevel
export function validatePermissionMode(value: unknown, source: string): PermissionMode
export function defaultModelForProfile(profile: AgentProfile): string
export function defaultThinkingLevelForProfile(profile: AgentProfile): ThinkingLevel
export function buildAgentCommand(profile: AgentProfile, model: string): string[]
export function buildAgentExecutionCommand(profile: AgentProfile, model: string, thinkingLevel: ThinkingLevel, searchEnabled?: boolean, permissionMode?: PermissionMode): string[]
export function buildAgentStreamingCommand(profile: AgentProfile, model: string, thinkingLevel: ThinkingLevel, permissionMode?: PermissionMode): string[]
export function supportsAgentStreaming(profile: AgentProfile): boolean
export function supportsPermissionMode(profile: AgentProfile): boolean
export function supportsThinkingLevel(profile: Pick<AgentProfile, 'name'>, thinkingLevel: ThinkingLevel): boolean
export function buildResumeAgentCommand(profile: AgentProfile, sessionId: string, executionCommand?: string[]): string[]
