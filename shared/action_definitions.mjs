import { findAgentProfile, validateAgentSelection } from './agent_profiles.mjs'

const ACTION_TYPES = ['agent', 'command']
const LEGACY_FIELDS = ['after', 'before', 'runIn', 'text']
export const CUSTOM_PROMPT_ACTION_ID = 'md2.custom-prompt'
export const CUSTOM_PROMPT_ACTION_NAME = 'custom prompt'

export const BUILTIN_CUSTOM_PROMPT = {
    agent: null,
    appliesTo: null,
    builtin: true,
    command: null,
    description: 'Send a custom prompt to the agent.',
    icon: null,
    id: CUSTOM_PROMPT_ACTION_ID,
    label: 'Custom prompt',
    model: null,
    name: CUSTOM_PROMPT_ACTION_NAME,
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    prompt: '{{prompt}}',
    sourcePath: null,
    thinkingLevel: null,
    type: 'agent',
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value, fieldName, source) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing action field ${fieldName} in ${source}`)

    return value
}

function readOptionalString(value, fieldName, source) {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid action field ${fieldName} in ${source}`)

    return value
}

function readActionType(value, source) {
    if (typeof value !== 'string' || !ACTION_TYPES.includes(value)) {
        throw new Error(`Invalid action type in ${source}: ${String(value)}`)
    }

    return value
}

function readAppliesTo(value, source) {
    if (value === undefined) return undefined
    if (!isPlainObject(value)) throw new Error(`Invalid appliesTo in ${source}`)

    const result = {}
    for (const [key, entry] of Object.entries(value)) {
        if (key.length === 0 || typeof entry !== 'string' || entry.length === 0) {
            throw new Error(`Invalid appliesTo value in ${source}: ${key}`)
        }
        result[key] = entry
    }

    return result
}

function readActionIdList(value, fieldName, source) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid ${fieldName} list in ${source}`)

    return value.map((entry, index) => requireString(entry, `${fieldName}[${index}]`, source))
}

function readOnRules(value, source) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid on list in ${source}`)

    return value.map((entry, index) => {
        if (!isPlainObject(entry)) throw new Error(`Invalid on rule in ${source}: ${index}`)
        const condition = requireString(entry.condition, `on[${index}].condition`, source)
        const actionId = requireString(entry.actionId, `on[${index}].actionId`, source)
        try {
            new RegExp(condition, 'u')
        } catch {
            throw new Error(`Invalid regular expression in ${source}: on[${index}].condition`)
        }

        return { actionId, condition }
    })
}

function rejectLegacyFields(value, source) {
    const legacyField = LEGACY_FIELDS.find((fieldName) => Object.hasOwn(value, fieldName))
    if (legacyField) throw new Error(`Legacy action field ${legacyField} is not supported in ${source}`)
    if (value.type === 'cmd') throw new Error(`Legacy action type cmd is not supported in ${source}`)
}

function validateTypeSpecificFields(value, type, source) {
    if (type === 'agent') {
        requireString(value.prompt, 'prompt', source)
        if (value.command !== undefined) throw new Error(`Command action field is not valid for agent action in ${source}`)
        return
    }

    requireString(value.command, 'command', source)
    if (value.prompt !== undefined) throw new Error(`Prompt action field is not valid for command action in ${source}`)
}

function validateAgentFields(raw, dependencies, source) {
    if (raw.model !== undefined && raw.agent === undefined) throw new Error(`Action model requires agent in ${source}`)
    if (raw.thinkingLevel !== undefined && (raw.agent === undefined || raw.model === undefined)) {
        throw new Error(`Action thinkingLevel requires agent and model in ${source}`)
    }
    if (raw.agent === undefined) return

    const profiles = dependencies.profiles ?? []
    if (!findAgentProfile(profiles, raw.agent)) return

    validateAgentSelection(profiles, { agent: raw.agent, model: raw.model ?? '' }, source)
}

function validateRawDefinition(value, source, dependencies) {
    if (!isPlainObject(value)) throw new Error(`Invalid action definition in ${source}`)
    rejectLegacyFields(value, source)

    const id = requireString(value.id, 'id', source)
    const name = requireString(value.name, 'name', source)
    const type = readActionType(value.type, source)
    requireString(value.label, 'label', source)
    requireString(value.description, 'description', source)
    validateTypeSpecificFields(value, type, source)
    if (value.icon !== undefined && typeof value.icon !== 'string') throw new Error(`Invalid icon in ${source}`)
    if (value.onState !== undefined && typeof value.onState !== 'string') throw new Error(`Invalid onState in ${source}`)
    if (value.needsWorkTree !== undefined && typeof value.needsWorkTree !== 'boolean') throw new Error(`Invalid needsWorkTree in ${source}`)

    const raw = {
        agent: readOptionalString(value.agent, 'agent', source),
        appliesTo: readAppliesTo(value.appliesTo, source),
        command: type === 'command' ? value.command : undefined,
        description: value.description,
        icon: value.icon,
        id,
        label: value.label,
        model: readOptionalString(value.model, 'model', source),
        name,
        needsWorkTree: value.needsWorkTree ?? false,
        on: readOnRules(value.on, source),
        onAfter: readActionIdList(value.onAfter, 'onAfter', source),
        onBefore: readActionIdList(value.onBefore, 'onBefore', source),
        onState: readOptionalString(value.onState, 'onState', source),
        prompt: type === 'agent' ? value.prompt : undefined,
        sourcePath: source,
        thinkingLevel: readOptionalString(value.thinkingLevel, 'thinkingLevel', source),
        type,
    }
    validateAgentFields(raw, dependencies, source)

    return raw
}

function parseActionFile(file, dependencies) {
    let parsed
    try {
        parsed = JSON.parse(file.content)
    } catch (error) {
        throw new Error(`Invalid action json in ${file.path}: ${error instanceof Error ? error.message : 'parse error'}`)
    }
    if (Array.isArray(parsed)) throw new Error(`Action file must contain one definition in ${file.path}`)

    return validateRawDefinition(parsed, file.path, dependencies)
}

function resolveAction(actionId, registry, source, fieldName) {
    const action = registry.get(actionId)
    if (!action) throw new Error(`Unknown action id ${actionId} in ${source}: ${fieldName}`)

    return action
}

function visitActionForCycles(action, visiting, done, trail) {
    if (done.has(action.id)) return
    if (visiting.has(action.id)) throw new Error(`Circular action reference: ${[...trail, action.id].join(' -> ')}`)

    visiting.add(action.id)
    const nextActions = [...action.onBefore, ...action.onAfter, ...action.on.map((rule) => rule.action)]
    for (const childAction of nextActions) visitActionForCycles(childAction, visiting, done, [...trail, action.id])
    visiting.delete(action.id)
    done.add(action.id)
}

function detectCycles(actions) {
    const visiting = new Set()
    const done = new Set()
    for (const action of actions) visitActionForCycles(action, visiting, done, [])
}

export function loadActionDefinitions(files, dependencies = {}) {
    const rawDefinitions = files.map((file) => parseActionFile(file, dependencies))
    const ids = new Set([CUSTOM_PROMPT_ACTION_ID])
    const names = new Set([CUSTOM_PROMPT_ACTION_NAME])
    for (const raw of rawDefinitions) {
        if (ids.has(raw.id)) throw new Error(`Duplicate action id ${raw.id} in ${raw.sourcePath}`)
        if (names.has(raw.name)) throw new Error(`Duplicate action name ${raw.name} in ${raw.sourcePath}`)
        ids.add(raw.id)
        names.add(raw.name)
    }

    const registry = new Map([[CUSTOM_PROMPT_ACTION_ID, BUILTIN_CUSTOM_PROMPT]])
    for (const raw of rawDefinitions) {
        registry.set(raw.id, {
            agent: raw.agent ?? null,
            appliesTo: raw.appliesTo ?? null,
            builtin: false,
            command: raw.command ?? null,
            description: raw.description,
            icon: raw.icon ?? null,
            id: raw.id,
            label: raw.label,
            model: raw.model ?? null,
            name: raw.name,
            needsWorkTree: raw.needsWorkTree,
            on: [],
            onAfter: [],
            onBefore: [],
            onState: raw.onState ?? null,
            prompt: raw.prompt ?? null,
            sourcePath: raw.sourcePath,
            thinkingLevel: raw.thinkingLevel ?? null,
            type: raw.type,
        })
    }

    for (const raw of rawDefinitions) {
        const action = registry.get(raw.id)
        action.onBefore = raw.onBefore.map((actionId) => resolveAction(actionId, registry, raw.sourcePath, 'onBefore'))
        action.onAfter = raw.onAfter.map((actionId) => resolveAction(actionId, registry, raw.sourcePath, 'onAfter'))
        action.on = raw.on.map(({ actionId, condition }) => ({
            action: resolveAction(actionId, registry, raw.sourcePath, 'on'),
            actionId,
            condition,
        }))
    }

    const actions = [BUILTIN_CUSTOM_PROMPT, ...rawDefinitions.map(({ id }) => registry.get(id))]
    detectCycles(actions)

    return actions
}
