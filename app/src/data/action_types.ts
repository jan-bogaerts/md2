export type ActionType = 'agent' | 'cmd'
export type ActionRunTarget = 'card' | 'project'

/** A raw json action file loaded from the project actions folder. */
export interface ActionFile {
    content: string
    path: string
}

/** Condition applied against the current context to decide when an action is shown. */
export type ActionAppliesTo = Record<string, string>

/** A sub-action is either an inline definition or a string ref to another action by `name`. */
export type RawSubAction = string | RawActionDefinition

/** A condition -> action pair evaluated against an action's output. */
export interface RawOnRule {
    action: RawSubAction
    condition: string
}

/** Action definition exactly as it appears in json, before refs are resolved. */
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
    runIn?: string
    text?: string
    type?: string
}

/** A condition -> action pair with the action resolved to a shared definition. */
export interface OnRule {
    action: ActionDefinition
    condition: string
}

/** Fully validated action with all sub-action refs resolved to shared definitions. */
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
    runIn: ActionRunTarget
    text: string
    type: ActionType
}

export const CUSTOM_PROMPT_ACTION_NAME = 'custom prompt'

/** Always-available agent action, independent of any project action files. */
export const BUILTIN_CUSTOM_PROMPT: ActionDefinition = {
    after: [],
    agent: null,
    appliesTo: null,
    before: [],
    builtin: true,
    description: 'Send a custom prompt to the agent.',
    icon: null,
    label: 'Custom prompt',
    model: null,
    name: CUSTOM_PROMPT_ACTION_NAME,
    on: [],
    onState: null,
    runIn: 'project',
    text: '{{prompt}}',
    type: 'agent',
}
