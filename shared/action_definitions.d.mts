import type { AgentProfile } from './agent_profiles.mjs'

export type ActionType = 'agent' | 'command'
export type ActionAppliesToField = 'kind' | 'type' | 'state' | 'file' | 'folder' | 'worktree' | 'worktreeError'
export type ActionAppliesTo = Partial<Record<ActionAppliesToField, string>>

export const ACTION_DEFINITION_FIELDS: readonly (keyof RawActionDefinition)[]
export const ACTION_AUTO_FINISH_FIELDS: readonly (keyof ActionAutoFinish)[]
export const ACTION_OUTPUT_FIELDS: readonly (keyof ActionOutput)[]
export const ACTION_ON_RULE_FIELDS: readonly (keyof RawOnRule)[]
export const ACTION_PHRASE_FIELDS: readonly (keyof ActionPhrase)[]
export const ACTION_APPLIES_TO_FIELDS: readonly ActionAppliesToField[]

export interface ActionFile {
    content: string
    path: string
}

export interface ActionDefinitionEntry {
    definition: unknown
    path: string
}

export interface RawActionDefinitionEntry extends ActionDefinitionEntry {
    definition: RawActionDefinition
}

export interface RawOnRule {
    actionId: string
    condition: string
}

export interface ActionPhrase {
    title: string
    text: string
}

export interface RawActionDefinition {
    agent?: string
    appliesTo?: ActionAppliesTo
    autoFinish?: ActionAutoFinish
    command?: string
    description: string
    icon?: string
    id: string
    label: string
    model?: string
    needsWorkTree?: boolean
    showCommandWindow?: boolean
    on?: RawOnRule[]
    onAfter?: string[]
    onBefore?: string[]
    onState?: string
    output?: ActionOutput
    phrases?: ActionPhrase[]
    permissionMode?: import('./agent_profiles.mjs').PermissionMode
    prompt?: string
    thinkingLevel?: string
    trackFileChanges?: boolean
    streaming?: boolean
    type: ActionType
}

export type ActionAutoFinish = {
    when: 'card-state'
    state: string
} | {
    when: 'diagram-created'
}

export interface ActionOutput {
    kind: 'diagram'
}

export interface OnRule extends RawOnRule {
    action: ActionDefinition
}

export interface ActionDefinition {
    agent: string | null
    appliesTo: ActionAppliesTo | null
    autoFinish?: ActionAutoFinish | null
    builtin: boolean
    command: string | null
    description: string
    icon: string | null
    id: string
    label: string
    model: string | null
    needsWorkTree: boolean
    showCommandWindow: boolean
    on: OnRule[]
    onAfter: ActionDefinition[]
    onBefore: ActionDefinition[]
    onState: string | null
    output: ActionOutput | null
    phrases: ActionPhrase[]
    permissionMode: import('./agent_profiles.mjs').PermissionMode | null
    prompt: string | null
    sourcePath: string | null
    thinkingLevel: string | null
    trackFileChanges: boolean
    streaming: boolean
    type: ActionType
}

export interface ActionDefinitionLoaderDependencies {
    profiles?: AgentProfile[]
    states?: string[]
    validateAgentCapabilities?: boolean
}

export interface ActionValidationErrorInit {
    code: string
    field?: keyof RawActionDefinition | null
    fieldPath?: string | null
    index?: number | null
    sourcePath?: string | null
}

export class ActionValidationError extends Error {
    code: string
    field: keyof RawActionDefinition | null
    fieldPath: string | null
    index: number | null
    sourcePath: string | null
    constructor(message: string, init: ActionValidationErrorInit)
}

export function sanitizeActionValidationError(error: unknown, log?: (message: string) => void): Error
export const CUSTOM_PROMPT_ACTION_ID: string
export const BUILTIN_CUSTOM_PROMPT: ActionDefinition
export const REMARKABLE_CONVERT_ACTION_ID: string
export const BUILTIN_REMARKABLE_CONVERT: ActionDefinition
export function validateActionDefinition(
    value: unknown,
    source: string,
    dependencies?: ActionDefinitionLoaderDependencies,
): RawActionDefinition & { sourcePath: string }
export function parseActionDefinitionFiles(files: ActionFile[]): ActionDefinitionEntry[]
export function validateActionDefinitionGraph(
    entries: ActionDefinitionEntry[],
    dependencies?: ActionDefinitionLoaderDependencies,
): ActionDefinition[]
export function loadActionDefinitions(files: ActionFile[], dependencies?: ActionDefinitionLoaderDependencies): ActionDefinition[]
