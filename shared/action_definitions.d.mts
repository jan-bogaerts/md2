import type { AgentProfile } from './agent_profiles.mjs'

export type ActionType = 'agent' | 'command'
export type ActionAppliesTo = Record<string, string>

export interface ActionFile {
    content: string
    path: string
}

export interface RawOnRule {
    actionId: string
    condition: string
}

export interface RawActionDefinition {
    agent?: string
    appliesTo?: ActionAppliesTo
    command?: string
    description: string
    icon?: string
    id: string
    label: string
    model?: string
    name: string
    needsWorkTree?: boolean
    on?: RawOnRule[]
    onAfter?: string[]
    onBefore?: string[]
    onState?: string
    prompt?: string
    thinkingLevel?: string
    type: ActionType
}

export interface OnRule extends RawOnRule {
    action: ActionDefinition
}

export interface ActionDefinition {
    agent: string | null
    appliesTo: ActionAppliesTo | null
    builtin: boolean
    command: string | null
    description: string
    icon: string | null
    id: string
    label: string
    model: string | null
    name: string
    needsWorkTree: boolean
    on: OnRule[]
    onAfter: ActionDefinition[]
    onBefore: ActionDefinition[]
    onState: string | null
    prompt: string | null
    sourcePath: string | null
    thinkingLevel: string | null
    type: ActionType
}

export interface ActionDefinitionLoaderDependencies {
    profiles?: AgentProfile[]
}

export interface ActionValidationErrorInit {
    code: string
    field?: keyof RawActionDefinition | null
    index?: number | null
    sourcePath?: string | null
}

export class ActionValidationError extends Error {
    code: string
    field: keyof RawActionDefinition | null
    index: number | null
    sourcePath: string | null
    constructor(message: string, init: ActionValidationErrorInit)
}

export function sanitizeActionValidationError(error: unknown, log?: (message: string) => void): Error
export const CUSTOM_PROMPT_ACTION_ID: string
export const CUSTOM_PROMPT_ACTION_NAME: string
export const BUILTIN_CUSTOM_PROMPT: ActionDefinition
export function loadActionDefinitions(files: ActionFile[], dependencies?: ActionDefinitionLoaderDependencies): ActionDefinition[]
