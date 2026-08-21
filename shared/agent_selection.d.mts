import type { AgentProfile, PermissionMode, ThinkingLevel } from './agent_profiles.mjs'

export interface AgentSettings {
    model: string
    thinkingLevel: ThinkingLevel
}

export interface AgentSelectionState {
    activeAgent: string
    permissionMode: PermissionMode | ''
    settingsByAgent: Record<string, AgentSettings>
}

export interface FlatAgentSelection {
    agent: string
    model: string
    permissionMode: PermissionMode | ''
    thinkingLevel: ThinkingLevel
}

export function profileAgentSettings(profile: AgentProfile): AgentSettings
export function validateAgentSettings(value: unknown, source: string): AgentSettings
export function validateAgentSelectionState(value: unknown, source: string, allowEmptyPermissionMode?: boolean): AgentSelectionState
export function resolveAgentSettings(agent: string, profiles: AgentProfile[], sources?: AgentSelectionState[]): AgentSettings
export function resolveAgentSelectionState(selection: AgentSelectionState, profiles: AgentProfile[], fallbackSources?: AgentSelectionState[]): AgentSelectionState
export function selectAgent(selection: AgentSelectionState, agent: string, profiles: AgentProfile[], fallbackSources?: AgentSelectionState[]): AgentSelectionState
export function selectModel(selection: AgentSelectionState, model: string): AgentSelectionState
export function selectThinkingLevel(selection: AgentSelectionState, thinkingLevel: ThinkingLevel): AgentSelectionState
export function selectPermissionMode(selection: AgentSelectionState, permissionMode: PermissionMode): AgentSelectionState
export function projectAgentSelection(selection: AgentSelectionState): FlatAgentSelection
