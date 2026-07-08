import { validateAgentSelection } from './agent_profiles.mjs'

const ACTION_TYPES = ['agent', 'cmd']
export const CUSTOM_PROMPT_ACTION_NAME = 'custom prompt'

export const BUILTIN_CUSTOM_PROMPT = {
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
    text: '{{prompt}}',
    type: 'agent',
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing action field: ${fieldName}`)

    return value
}

function requireActionType(value, name) {
    if (typeof value !== 'string' || !ACTION_TYPES.includes(value)) throw new Error(`Invalid action type for "${name}": ${String(value)}`)

    return value
}

function readAppliesTo(value, name) {
    if (value === undefined) return null
    if (!isPlainObject(value)) throw new Error(`Invalid appliesTo for "${name}"`)

    const result = {}
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string') throw new Error(`Invalid appliesTo value for "${name}": ${key}`)
        result[key] = entry
    }

    return result
}

function readSubActionList(value, name, field) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid ${field} list for "${name}"`)

    return value.map((entry) => {
        if (typeof entry === 'string') return entry
        if (isPlainObject(entry)) return entry
        throw new Error(`Invalid ${field} sub-action for "${name}"`)
    })
}

function readOnRules(value, name) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid on list for "${name}"`)

    return value.map((entry) => {
        if (!isPlainObject(entry)) throw new Error(`Invalid on rule for "${name}"`)
        const condition = requireString(entry.condition, `on.condition for "${name}"`)
        const action = entry.action
        if (typeof action !== 'string' && !isPlainObject(action)) throw new Error(`Invalid on action for "${name}"`)

        return { action, condition }
    })
}

function validateRawDefinition(value, source) {
    if (!isPlainObject(value)) throw new Error(`Invalid action definition in ${source}`)

    const name = requireString(value.name, `name in ${source}`)
    requireString(value.label, `label for "${name}"`)
    requireString(value.description, `description for "${name}"`)
    requireActionType(value.type, name)
    requireString(value.text, `text for "${name}"`)
    if (value.icon !== undefined && typeof value.icon !== 'string') throw new Error(`Invalid icon for "${name}"`)
    if (value.onState !== undefined && typeof value.onState !== 'string') throw new Error(`Invalid onState for "${name}"`)
    if (value.agent !== undefined && typeof value.agent !== 'string') throw new Error(`Invalid agent for "${name}"`)
    if (value.model !== undefined && typeof value.model !== 'string') throw new Error(`Invalid model for "${name}"`)

    return {
        after: readSubActionList(value.after, name, 'after'),
        agent: value.agent,
        appliesTo: readAppliesTo(value.appliesTo, name) ?? undefined,
        before: readSubActionList(value.before, name, 'before'),
        description: value.description,
        icon: value.icon,
        label: value.label,
        model: value.model,
        name,
        on: readOnRules(value.on, name),
        onState: value.onState,
        text: value.text,
        type: value.type,
    }
}

function collectDefinition(value, source, registry) {
    const raw = validateRawDefinition(value, source)
    if (raw.name === CUSTOM_PROMPT_ACTION_NAME) throw new Error(`Action name "${raw.name}" is reserved for the built-in action`)
    if (registry.has(raw.name)) throw new Error(`Duplicate action name: ${raw.name}`)
    registry.set(raw.name, raw)

    for (const subAction of [...raw.before, ...raw.after]) {
        if (typeof subAction !== 'string') collectDefinition(subAction, source, registry)
    }
    for (const rule of raw.on) {
        if (typeof rule.action !== 'string') collectDefinition(rule.action, source, registry)
    }
}

function parseActionFile(file) {
    let parsed
    try {
        parsed = JSON.parse(file.content)
    } catch (error) {
        throw new Error(`Invalid action json in ${file.path}: ${error instanceof Error ? error.message : 'parse error'}`)
    }

    return Array.isArray(parsed) ? parsed : [parsed]
}

function resolveRef(subAction, resolved) {
    const name = typeof subAction === 'string' ? subAction : subAction.name
    const target = name === undefined ? undefined : resolved.get(name)
    if (!target) throw new Error(`Unknown action ref: ${String(name)}`)

    return target
}

function visitActionForCycles(action, visiting, done, trail) {
    if (done.has(action.name)) return
    if (visiting.has(action.name)) throw new Error(`Circular action reference: ${[...trail, action.name].join(' -> ')}`)

    visiting.add(action.name)
    const nextActions = [...action.before, ...action.after, ...action.on.map((rule) => rule.action)]
    for (const childAction of nextActions) visitActionForCycles(childAction, visiting, done, [...trail, action.name])
    visiting.delete(action.name)
    done.add(action.name)
}

function detectCycles(actions) {
    const visiting = new Set()
    const done = new Set()

    for (const action of actions) visitActionForCycles(action, visiting, done, [])
}

function validateAgentFields(raw, dependencies) {
    if (raw.agent === undefined && raw.model === undefined) return

    const agent = raw.agent ?? dependencies.defaultAgent
    if (!agent) throw new Error(`Missing default agent for action "${raw.name}" model validation`)

    validateAgentSelection(dependencies.profiles ?? [], { agent, model: raw.model ?? '' }, `action "${raw.name}"`)
}

export function loadActionDefinitions(files, dependencies = {}) {
    const registry = new Map()
    for (const file of files) {
        for (const item of parseActionFile(file)) collectDefinition(item, file.path, registry)
    }
    for (const raw of registry.values()) validateAgentFields(raw, dependencies)

    const resolved = new Map()
    resolved.set(CUSTOM_PROMPT_ACTION_NAME, BUILTIN_CUSTOM_PROMPT)

    for (const raw of registry.values()) {
        resolved.set(raw.name, {
            after: [],
            agent: raw.agent ?? null,
            appliesTo: raw.appliesTo ?? null,
            before: [],
            builtin: false,
            description: raw.description,
            icon: raw.icon ?? null,
            label: raw.label,
            model: raw.model ?? null,
            name: raw.name,
            on: [],
            onState: raw.onState ?? null,
            text: raw.text,
            type: raw.type,
        })
    }

    for (const raw of registry.values()) {
        const definition = resolved.get(raw.name)
        if (!definition) continue

        definition.before = raw.before.map((subAction) => resolveRef(subAction, resolved))
        definition.after = raw.after.map((subAction) => resolveRef(subAction, resolved))
        definition.on = raw.on.map((rule) => ({ action: resolveRef(rule.action, resolved), condition: rule.condition }))
    }

    const actions = [BUILTIN_CUSTOM_PROMPT, ...[...registry.keys()].map((name) => resolved.get(name))]
    detectCycles(actions)

    return actions
}
