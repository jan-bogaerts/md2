import type { AgentProfile } from './agent_profiles'

export type ActionType = 'agent' | 'cmd'

export interface ActionFile {
    content: string
    path: string
}

export type ActionAppliesTo = Record<string, string>
export type RawSubAction = string | RawActionDefinition

export interface RawOnRule {
    action: RawSubAction
    condition: string
}

export interface RawActionDefinition {
    after?: RawSubAction[]
    agent?: string
    appliesTo?: ActionAppliesTo
    before?: RawSubAction[]
    description?: string
    icon?: string
    label?: string
    model?: string
    name?: string
    on?: RawOnRule[]
    onState?: string
    text?: string
    type?: string
}

export interface OnRule {
    action: ActionDefinition
    condition: string
}

export interface ActionDefinition {
    after: ActionDefinition[]
    agent: string | null
    appliesTo: ActionAppliesTo | null
    before: ActionDefinition[]
    builtin: boolean
    description: string
    icon: string | null
    label: string
    model: string | null
    name: string
    on: OnRule[]
    onState: string | null
    text: string
    type: ActionType
}

export interface ActionDefinitionLoaderDependencies {
    defaultAgent?: string
    profiles?: AgentProfile[]
}

export const CUSTOM_PROMPT_ACTION_NAME: string
export const BUILTIN_CUSTOM_PROMPT: ActionDefinition
export function loadActionDefinitions(files: ActionFile[], dependencies?: ActionDefinitionLoaderDependencies): ActionDefinition[]
