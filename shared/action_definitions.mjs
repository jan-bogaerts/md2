import { validateAgentSelection, validateThinkingLevel } from './agent_profiles.mjs'
import { normalizeLogFileValue } from './log_paths.mjs'

const ACTION_TYPES = ['agent', 'command']
const LEGACY_FIELDS = ['after', 'before', 'runIn', 'text']
export const ACTION_DEFINITION_FIELDS = Object.freeze([
    'id', 'label', 'description', 'type', 'icon', 'appliesTo', 'onBefore', 'on', 'onAfter',
    'onState', 'needsWorkTree', 'trackFileChanges', 'agent', 'model', 'thinkingLevel', 'prompt', 'command', 'phrases',
])
export const ACTION_ON_RULE_FIELDS = Object.freeze(['actionId', 'condition'])
export const ACTION_PHRASE_FIELDS = Object.freeze(['title', 'text'])
export const ACTION_APPLIES_TO_FIELDS = Object.freeze([
    'kind', 'type', 'state', 'file', 'folder', 'worktree', 'worktreeError',
])
const ACTION_DEFINITION_FIELD_SET = new Set(ACTION_DEFINITION_FIELDS)
const ACTION_ON_RULE_FIELD_SET = new Set(ACTION_ON_RULE_FIELDS)
const ACTION_PHRASE_FIELD_SET = new Set(ACTION_PHRASE_FIELDS)
const ACTION_APPLIES_TO_FIELD_SET = new Set(ACTION_APPLIES_TO_FIELDS)
export const CUSTOM_PROMPT_ACTION_ID = 'md2.custom-prompt'
export const REMARKABLE_CONVERT_ACTION_ID = 'md2.convert-remarkable-images-to-text'

// Fields the editor can route an error to. Anything else routes to the general summary.
const ROUTABLE_FIELDS = new Set([
    'id', 'label', 'description', 'type', 'icon', 'appliesTo', 'onBefore', 'on', 'onAfter',
    'onState', 'needsWorkTree', 'trackFileChanges', 'agent', 'model', 'thinkingLevel', 'prompt', 'command', 'phrases',
])

/**
 * A validation failure carrying stable routing metadata (never inferred from the message text):
 * a machine `code`, the routable `field` (or null for definition/file errors), an optional list
 * `index`, and the `sourcePath` of the offending file.
 */
export class ActionValidationError extends Error {
    constructor(message, { code, field = null, fieldPath = null, index = null, sourcePath = null }) {
        super(message)
        this.name = 'ActionValidationError'
        this.code = code
        this.field = ROUTABLE_FIELDS.has(field) ? field : null
        this.fieldPath = fieldPath
        this.index = index
        this.sourcePath = sourcePath
    }
}

// Split a validator field name such as `onBefore[2]` or `on[1].condition` into a routable
// base field and list index. Ids/paths embedded in the name never leak into routing.
function routeField(fieldName) {
    if (typeof fieldName !== 'string') return { field: null, index: null }
    const match = /^([A-Za-z]+)(?:\[(\d+)\])?/u.exec(fieldName)
    if (!match) return { field: null, index: null }

    return { field: match[1], index: match[2] === undefined ? null : Number(match[2]) }
}

function fail(message, code, source, fieldName = null) {
    const { field, index } = routeField(fieldName)

    return new ActionValidationError(message, { code, field, fieldPath: fieldName, index, sourcePath: source })
}

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
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    phrases: [],
    prompt: '{{card-prompt}}',
    sourcePath: null,
    thinkingLevel: null,
    trackFileChanges: false,
    type: 'agent',
}

export const BUILTIN_REMARKABLE_CONVERT = {
    agent: null,
    appliesTo: null,
    builtin: true,
    command: null,
    description: 'Transcribe imported Remarkable images and append the text to the card.',
    icon: null,
    id: REMARKABLE_CONVERT_ACTION_ID,
    label: 'Convert Remarkable images to text',
    model: null,
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    phrases: [],
    prompt: 'Convert the following Remarkable images to text and append the transcription to {{card-file}}:\n{{card-prompt}}',
    sourcePath: null,
    thinkingLevel: null,
    trackFileChanges: false,
    type: 'agent',
}

const BUILTIN_ACTIONS = [BUILTIN_CUSTOM_PROMPT, BUILTIN_REMARKABLE_CONVERT]

/**
 * Log an action validation failure with its routing code and source path (no stack), then return a
 * message-only Error safe to surface to users. Non-validation errors pass through unchanged.
 */
export function sanitizeActionValidationError(error, log = console.error) {
    if (!(error instanceof ActionValidationError)) return error
    log(`[action-validation] code=${error.code} path=${error.sourcePath ?? 'unknown'}`)

    return new Error(error.message)
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectUnknownFields(value, allowedFields, source, parentPath = null) {
    const unknownField = Object.getOwnPropertyNames(value).find((fieldName) => !allowedFields.has(fieldName))
    if (!unknownField) return

    const fieldPath = parentPath ? `${parentPath}.${unknownField}` : unknownField
    throw fail(`Unknown action field ${fieldPath} in ${source}`, 'unknownField', source, fieldPath)
}

function requireNonWhitespaceString(value, fieldName, source) {
    if (typeof value !== 'string' || value.trim().length === 0) throw fail(`Missing action field ${fieldName} in ${source}`, 'missing-field', source, fieldName)

    return value
}

function requireHumanText(value, fieldName, source) {
    return requireNonWhitespaceString(value, fieldName, source)
}

function requireIdentity(value, fieldName, source) {
    const identity = requireNonWhitespaceString(value, fieldName, source)
    if (identity !== identity.trim()) throw fail(`Invalid action field ${fieldName} in ${source}: surrounding whitespace`, 'invalid-field', source, fieldName)

    return identity
}

function requireExecutableText(value, fieldName, source) {
    return requireNonWhitespaceString(value, fieldName, source)
}

function requireRegularExpression(value, fieldName, source) {
    const condition = requireNonWhitespaceString(value, fieldName, source)
    try {
        new RegExp(condition, 'u')
    } catch {
        throw fail(`Invalid regular expression in ${source}: ${fieldName}`, 'invalid-regex', source, fieldName)
    }

    return condition
}

function readOptionalString(value, fieldName, source) {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value.length === 0) throw fail(`Invalid action field ${fieldName} in ${source}`, 'invalid-field', source, fieldName)

    return value
}

function readActionType(value, source) {
    if (typeof value !== 'string' || !ACTION_TYPES.includes(value)) {
        throw fail(`Invalid action type in ${source}: ${String(value)}`, 'invalid-type', source, 'type')
    }

    return value
}

function readAppliesTo(value, source) {
    if (value === undefined) return undefined
    if (!isPlainObject(value)) throw fail(`Invalid appliesTo in ${source}`, 'invalid-applies-to', source, 'appliesTo')
    rejectUnknownFields(value, ACTION_APPLIES_TO_FIELD_SET, source, 'appliesTo')

    const result = {}
    for (const [key, entry] of Object.entries(value)) {
        if (key.length === 0 || typeof entry !== 'string' || entry.length === 0) {
            throw fail(`Invalid appliesTo value in ${source}: ${key}`, 'invalid-applies-to', source, 'appliesTo')
        }
        result[key] = entry
    }

    return result
}

function readActionIdList(value, fieldName, source) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw fail(`Invalid ${fieldName} list in ${source}`, 'invalid-list', source, fieldName)

    return value.map((entry, index) => requireIdentity(entry, `${fieldName}[${index}]`, source))
}

function readOnRules(value, source) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw fail(`Invalid on list in ${source}`, 'invalid-list', source, 'on')

    return value.map((entry, index) => {
        if (!isPlainObject(entry)) throw fail(`Invalid on rule in ${source}: ${index}`, 'invalid-on', source, `on[${index}]`)
        rejectUnknownFields(entry, ACTION_ON_RULE_FIELD_SET, source, `on[${index}]`)
        const condition = requireRegularExpression(entry.condition, `on[${index}].condition`, source)
        const actionId = requireIdentity(entry.actionId, `on[${index}].actionId`, source)

        return { actionId, condition }
    })
}

function readPhrases(value, source) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw fail(`Invalid phrases list in ${source}`, 'invalid-list', source, 'phrases')

    return value.map((entry, index) => {
        if (!isPlainObject(entry)) throw fail(`Invalid phrase in ${source}: ${index}`, 'invalid-phrase', source, `phrases[${index}]`)
        rejectUnknownFields(entry, ACTION_PHRASE_FIELD_SET, source, `phrases[${index}]`)
        if (typeof entry.title !== 'string') throw fail(`Invalid phrase title in ${source}: ${index}`, 'invalid-phrase', source, `phrases[${index}].title`)
        if (typeof entry.text !== 'string') throw fail(`Invalid phrase text in ${source}: ${index}`, 'invalid-phrase', source, `phrases[${index}].text`)

        return { title: entry.title, text: entry.text }
    })
}

function rejectLegacyFields(value, source) {
    const legacyField = LEGACY_FIELDS.find((fieldName) => Object.hasOwn(value, fieldName))
    if (legacyField) throw fail(`Legacy action field ${legacyField} is not supported in ${source}`, 'legacy-field', source)
    if (value.type === 'cmd') throw fail(`Legacy action type cmd is not supported in ${source}`, 'legacy-field', source, 'type')
}

function validateTypeSpecificFields(value, type, source) {
    if (type === 'agent') {
        requireExecutableText(value.prompt, 'prompt', source)
        if (value.command !== undefined) throw fail(`Command action field is not valid for agent action in ${source}`, 'field-not-allowed', source, 'command')
        return
    }

    requireExecutableText(value.command, 'command', source)
    if (value.prompt !== undefined) throw fail(`Prompt action field is not valid for command action in ${source}`, 'field-not-allowed', source, 'prompt')
    if (value.trackFileChanges !== undefined) throw fail(`Agent action field trackFileChanges is not valid for command action in ${source}`, 'field-not-allowed', source, 'trackFileChanges')
}

function validateAgentFields(raw, dependencies, source) {
    if (raw.model !== undefined && raw.agent === undefined) throw fail(`Action model requires agent in ${source}`, 'agent-required', source, 'model')
    if (raw.thinkingLevel !== undefined && (raw.agent === undefined || raw.model === undefined)) {
        throw fail(`Action thinkingLevel requires agent and model in ${source}`, 'agent-model-required', source, 'thinkingLevel')
    }
    if (raw.agent === undefined) return
    if (dependencies.validateAgentCapabilities === false) return

    const profiles = dependencies.profiles ?? []
    try {
        validateAgentSelection(profiles, { agent: raw.agent, model: raw.model ?? '' }, source)
    } catch (error) {
        // Route by the tagged code, never by message text.
        const field = error.code === 'unknown-agent' ? 'agent' : 'model'
        throw fail(error.message, error.code ?? 'invalid-agent', source, field)
    }
    if (raw.thinkingLevel === undefined) return

    try {
        validateThinkingLevel(raw.thinkingLevel, source)
    } catch (error) {
        throw fail(error.message, error.code ?? 'invalid-thinking-level', source, 'thinkingLevel')
    }
}

function validateRawDefinition(value, source, dependencies) {
    if (!isPlainObject(value)) throw fail(`Invalid action definition in ${source}`, 'invalid-definition', source)
    rejectLegacyFields(value, source)
    rejectUnknownFields(value, ACTION_DEFINITION_FIELD_SET, source)

    const id = requireIdentity(value.id, 'id', source)
    const type = readActionType(value.type, source)
    requireHumanText(value.label, 'label', source)
    requireHumanText(value.description, 'description', source)
    validateTypeSpecificFields(value, type, source)
    if (value.icon !== undefined && typeof value.icon !== 'string') throw fail(`Invalid icon in ${source}`, 'invalid-field', source, 'icon')
    if (value.onState !== undefined && typeof value.onState !== 'string') throw fail(`Invalid onState in ${source}`, 'invalid-field', source, 'onState')
    if (value.needsWorkTree !== undefined && typeof value.needsWorkTree !== 'boolean') throw fail(`Invalid needsWorkTree in ${source}`, 'invalid-field', source, 'needsWorkTree')
    if (value.trackFileChanges !== undefined && typeof value.trackFileChanges !== 'boolean') throw fail(`Invalid trackFileChanges in ${source}`, 'invalid-field', source, 'trackFileChanges')

    const raw = {
        agent: readOptionalString(value.agent, 'agent', source),
        appliesTo: readAppliesTo(value.appliesTo, source),
        command: type === 'command' ? value.command : undefined,
        description: value.description,
        icon: value.icon,
        id,
        label: value.label,
        model: readOptionalString(value.model, 'model', source),
        needsWorkTree: value.needsWorkTree ?? false,
        on: readOnRules(value.on, source),
        onAfter: readActionIdList(value.onAfter, 'onAfter', source),
        onBefore: readActionIdList(value.onBefore, 'onBefore', source),
        onState: readOptionalString(value.onState, 'onState', source),
        phrases: readPhrases(value.phrases, source),
        prompt: type === 'agent' ? value.prompt : undefined,
        sourcePath: source,
        thinkingLevel: readOptionalString(value.thinkingLevel, 'thinkingLevel', source),
        trackFileChanges: value.trackFileChanges ?? false,
        type,
    }
    validateAgentFields(raw, dependencies, source)

    return raw
}

/** Validate one in-memory definition before serialization can omit `undefined` unknown fields. */
export function validateActionDefinition(value, source, dependencies = {}) {
    return validateRawDefinition(value, source, dependencies)
}

function parseActionFile(file) {
    let parsed
    try {
        parsed = JSON.parse(file.content)
    } catch (error) {
        throw fail(`Invalid action json in ${file.path}: ${error instanceof Error ? error.message : 'parse error'}`, 'invalid-json', file.path)
    }
    if (Array.isArray(parsed)) throw fail(`Action file must contain one definition in ${file.path}`, 'invalid-definition', file.path)

    return { definition: parsed, path: file.path }
}

function resolveAction(actionId, registry, source, fieldName, index) {
    const action = registry.get(actionId)
    if (!action) throw fail(`Unknown action id ${actionId} in ${source}: ${fieldName}`, 'unknown-action', source, `${fieldName}[${index}]`)

    return action
}

function visitActionForCycles(action, visiting, done, trail) {
    if (done.has(action.id)) return
    if (visiting.has(action.id)) throw fail(`Circular action reference: ${[...trail, action.id].join(' -> ')}`, 'circular-reference', action.sourcePath)

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

/** Parse action files once at the file-loading boundary. */
export function parseActionDefinitionFiles(files) {
    return files.map((file) => parseActionFile(file))
}

/** Validate and resolve a whole-project graph of structured action definitions. */
export function validateActionDefinitionGraph(entries, dependencies = {}) {
    const rawDefinitions = entries.map(({ definition, path }) => validateRawDefinition(definition, path, dependencies))
    const ids = new Set(BUILTIN_ACTIONS.map(({ id }) => id))
    const normalizedIds = new Map(BUILTIN_ACTIONS.map(({ id }) => [normalizeLogFileValue(id), id]))
    for (const raw of rawDefinitions) {
        if (ids.has(raw.id)) throw fail(`Duplicate action id ${raw.id} in ${raw.sourcePath}`, 'duplicate-id', raw.sourcePath, 'id')
        const normalizedId = normalizeLogFileValue(raw.id)
        const collidingId = normalizedIds.get(normalizedId)
        if (collidingId) {
            throw fail(
                `Action id ${raw.id} in ${raw.sourcePath} collides with ${collidingId} after log filename normalization`,
                'normalized-id-collision',
                raw.sourcePath,
                'id',
            )
        }
        ids.add(raw.id)
        normalizedIds.set(normalizedId, raw.id)
    }

    const registry = new Map(BUILTIN_ACTIONS.map((action) => [action.id, action]))
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
            needsWorkTree: raw.needsWorkTree,
            on: [],
            onAfter: [],
            onBefore: [],
            onState: raw.onState ?? null,
            phrases: raw.phrases,
            prompt: raw.prompt ?? null,
            sourcePath: raw.sourcePath,
            thinkingLevel: raw.thinkingLevel ?? null,
            trackFileChanges: raw.trackFileChanges,
            type: raw.type,
        })
    }

    for (const raw of rawDefinitions) {
        const action = registry.get(raw.id)
        action.onBefore = raw.onBefore.map((actionId, index) => resolveAction(actionId, registry, raw.sourcePath, 'onBefore', index))
        action.onAfter = raw.onAfter.map((actionId, index) => resolveAction(actionId, registry, raw.sourcePath, 'onAfter', index))
        action.on = raw.on.map(({ actionId, condition }, index) => ({
            action: resolveAction(actionId, registry, raw.sourcePath, 'on', index),
            actionId,
            condition,
        }))
    }

    const actions = [...BUILTIN_ACTIONS, ...rawDefinitions.map(({ id }) => registry.get(id))]
    detectCycles(actions)

    return actions
}

export function loadActionDefinitions(files, dependencies = {}) {
    return validateActionDefinitionGraph(parseActionDefinitionFiles(files), dependencies)
}
