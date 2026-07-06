import {
    BUILTIN_CUSTOM_PROMPT,
    CUSTOM_PROMPT_ACTION_NAME,
    type ActionAppliesTo,
    type ActionDefinition,
    type ActionFile,
    type ActionType,
    type RawActionDefinition,
    type RawOnRule,
    type RawSubAction,
} from '../data/action_types'
import { validateAgentSelection, type AgentProfile } from '../data/agent_profiles'
import { configService } from './config_service'

const ACTION_TYPES: ActionType[] = ['agent', 'cmd']

/** A raw definition after its own fields are validated: required fields are guaranteed present. */
type NormalizedAction = RawActionDefinition & {
    after: RawSubAction[]
    before: RawSubAction[]
    description: string
    label: string
    name: string
    on: RawOnRule[]
    text: string
    type: string
}

interface ActionDefinitionLoaderDependencies {
    defaultAgent?: string
    profiles?: AgentProfile[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing action field: ${fieldName}`)

    return value
}

function requireType(value: unknown, name: string): ActionType {
    if (typeof value !== 'string' || !ACTION_TYPES.includes(value as ActionType)) {
        throw new Error(`Invalid action type for "${name}": ${String(value)}`)
    }

    return value as ActionType
}

function readAppliesTo(value: unknown, name: string): ActionAppliesTo | null {
    if (value === undefined) return null
    if (!isPlainObject(value)) throw new Error(`Invalid appliesTo for "${name}"`)

    const result: ActionAppliesTo = {}
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string') throw new Error(`Invalid appliesTo value for "${name}": ${key}`)
        result[key] = entry
    }

    return result
}

function readSubActionList(value: unknown, name: string, field: string): RawSubAction[] {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid ${field} list for "${name}"`)

    return value.map((entry) => {
        if (typeof entry === 'string') return entry
        if (isPlainObject(entry)) return entry as RawActionDefinition
        throw new Error(`Invalid ${field} sub-action for "${name}"`)
    })
}

function readOnRules(value: unknown, name: string): RawOnRule[] {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid on list for "${name}"`)

    return value.map((entry) => {
        if (!isPlainObject(entry)) throw new Error(`Invalid on rule for "${name}"`)
        const condition = requireString(entry.condition, `on.condition for "${name}"`)
        const action = entry.action
        if (typeof action !== 'string' && !isPlainObject(action)) throw new Error(`Invalid on action for "${name}"`)

        return { action: action as RawSubAction, condition }
    })
}

/** Validate a raw definition's own fields (not its refs) and return a normalized shape. */
function validateRawDefinition(value: unknown, source: string): NormalizedAction {
    if (!isPlainObject(value)) throw new Error(`Invalid action definition in ${source}`)

    const name = requireString(value.name, `name in ${source}`)
    requireString(value.label, `label for "${name}"`)
    requireString(value.description, `description for "${name}"`)
    requireType(value.type, name)
    requireString(value.text, `text for "${name}"`)
    if (value.icon !== undefined && typeof value.icon !== 'string') throw new Error(`Invalid icon for "${name}"`)
    if (value.onState !== undefined && typeof value.onState !== 'string') throw new Error(`Invalid onState for "${name}"`)
    if (value.agent !== undefined && typeof value.agent !== 'string') throw new Error(`Invalid agent for "${name}"`)
    if (value.model !== undefined && typeof value.model !== 'string') throw new Error(`Invalid model for "${name}"`)

    return {
        after: readSubActionList(value.after, name, 'after'),
        agent: value.agent as string | undefined,
        appliesTo: readAppliesTo(value.appliesTo, name) ?? undefined,
        before: readSubActionList(value.before, name, 'before'),
        description: value.description as string,
        icon: value.icon as string | undefined,
        label: value.label as string,
        model: value.model as string | undefined,
        name,
        on: readOnRules(value.on, name),
        onState: value.onState as string | undefined,
        text: value.text as string,
        type: value.type as string,
    }
}

function defaultLoaderDependencies(): ActionDefinitionLoaderDependencies {
    if (!configService.isInitialized()) return {}

    return {
        defaultAgent: configService.get('desktop.agent') as string,
        profiles: configService.get('desktop.agentProfiles') as AgentProfile[],
    }
}

function validateAgentFields(raw: NormalizedAction, dependencies: ActionDefinitionLoaderDependencies) {
    if (raw.agent === undefined && raw.model === undefined) return

    const agent = raw.agent ?? dependencies.defaultAgent
    if (!agent) throw new Error(`Missing default agent for action "${raw.name}" model validation`)

    validateAgentSelection(dependencies.profiles ?? [], { agent, model: raw.model ?? '' }, `action "${raw.name}"`)
}

/** Recursively validate and register a definition and any inline sub-actions, deduping by name. */
function collectDefinition(value: unknown, source: string, registry: Map<string, NormalizedAction>) {
    const raw = validateRawDefinition(value, source)
    if (raw.name === CUSTOM_PROMPT_ACTION_NAME) throw new Error(`Action name "${raw.name}" is reserved for the built-in action`)
    if (registry.has(raw.name)) throw new Error(`Duplicate action name: ${raw.name}`)
    registry.set(raw.name, raw)

    for (const sub of [...(raw.before ?? []), ...(raw.after ?? [])]) {
        if (typeof sub !== 'string') collectDefinition(sub, source, registry)
    }
    for (const rule of raw.on ?? []) {
        if (typeof rule.action !== 'string') collectDefinition(rule.action, source, registry)
    }
}

function parseFile(file: ActionFile): unknown[] {
    let parsed: unknown
    try {
        parsed = JSON.parse(file.content)
    } catch (error) {
        throw new Error(`Invalid action json in ${file.path}: ${error instanceof Error ? error.message : 'parse error'}`)
    }

    return Array.isArray(parsed) ? parsed : [parsed]
}

/** Resolve a sub-action ref (string or inline) to its shared resolved definition. */
function resolveRef(sub: RawSubAction, resolved: Map<string, ActionDefinition>): ActionDefinition {
    const name = typeof sub === 'string' ? sub : sub.name
    const target = name === undefined ? undefined : resolved.get(name)
    if (!target) throw new Error(`Unknown action ref: ${String(name)}`)

    return target
}

/** Depth-first search for a cycle through before/after/on edges. */
function detectCycles(actions: ActionDefinition[]) {
    const visiting = new Set<string>()
    const done = new Set<string>()

    const visit = (action: ActionDefinition, trail: string[]) => {
        if (done.has(action.name)) return
        if (visiting.has(action.name)) {
            throw new Error(`Circular action reference: ${[...trail, action.name].join(' -> ')}`)
        }
        visiting.add(action.name)
        const next = [...action.before, ...action.after, ...action.on.map((rule) => rule.action)]
        for (const child of next) visit(child, [...trail, action.name])
        visiting.delete(action.name)
        done.add(action.name)
    }

    for (const action of actions) visit(action, [])
}

/**
 * Load and validate action definitions from raw json files. Always includes the built-in
 * `custom prompt` action. Fails fast with a clear error on invalid json, missing required
 * fields, unknown refs, duplicate names or circular calls. String refs and inline definitions
 * resolve to the same shared definition object.
 */
export function loadActionDefinitions(
    files: ActionFile[],
    dependencies: ActionDefinitionLoaderDependencies = defaultLoaderDependencies(),
): ActionDefinition[] {
    const registry = new Map<string, NormalizedAction>()
    for (const file of files) {
        for (const item of parseFile(file)) collectDefinition(item, file.path, registry)
    }
    for (const raw of registry.values()) validateAgentFields(raw, dependencies)

    const resolved = new Map<string, ActionDefinition>()
    resolved.set(CUSTOM_PROMPT_ACTION_NAME, BUILTIN_CUSTOM_PROMPT)

    for (const raw of registry.values()) {
        resolved.set(raw.name, {
            after: [],
            agent: raw.agent ?? null,
            appliesTo: raw.appliesTo ?? null,
            before: [],
            builtin: false,
            description: raw.description as string,
            icon: raw.icon ?? null,
            label: raw.label as string,
            model: raw.model ?? null,
            name: raw.name,
            on: [],
            onState: raw.onState ?? null,
            text: raw.text as string,
            type: raw.type as ActionType,
        })
    }

    for (const raw of registry.values()) {
        const definition = resolved.get(raw.name)
        if (!definition) continue
        definition.before = (raw.before ?? []).map((sub) => resolveRef(sub, resolved))
        definition.after = (raw.after ?? []).map((sub) => resolveRef(sub, resolved))
        definition.on = (raw.on ?? []).map((rule) => ({ action: resolveRef(rule.action, resolved), condition: rule.condition }))
    }

    const actions = [BUILTIN_CUSTOM_PROMPT, ...[...registry.keys()].map((name) => resolved.get(name) as ActionDefinition)]
    detectCycles(actions)

    return actions
}
