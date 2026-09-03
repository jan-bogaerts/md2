import {
    ACTION_APPLIES_TO_FIELDS,
    ACTION_AUTO_FINISH_FIELDS,
    ACTION_DEFINITION_FIELDS,
    ACTION_ON_RULE_FIELDS,
    ACTION_OUTPUT_FIELDS,
    ACTION_PHRASE_FIELDS,
    BUILTIN_CUSTOM_PROMPT,
    BUILTIN_REMARKABLE_CONVERT,
    ActionValidationError,
    parseActionDefinitionFiles,
    validateActionDefinition,
    validateActionDefinitionGraph,
} from './action_definitions.mjs'

const DEFAULT_ACTION_DESCRIPTION = 'No description provided.'
const DEFAULT_AGENT_PROMPT = 'Describe what this action should do.'
const DEFAULT_COMMAND = 'echo Missing action command'
const DEFAULT_ON_CONDITION = '.*'

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function knownFields(value, fields) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => fields.includes(key)))
}

function defaultActionName(path) {
    const fileName = path.replace(/\\/gu, '/').split('/').at(-1)?.replace(/\.json$/iu, '')

    return fileName && fileName.length > 0 ? fileName : 'Unnamed action'
}

function defaultActionId(path) {
    const pathIdentity = path.replace(/\.json$/iu, '').replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, '').toLowerCase()

    return `action-${pathIdentity || 'unnamed'}`
}

function addMissingString(definition, field, defaultValue, path, issues) {
    if (definition[field] !== undefined) return

    definition[field] = defaultValue
    issues.push({ message: `Missing ${field}; using ${JSON.stringify(defaultValue)} in ${path}`, path })
}

function sanitizePhrases(value, path, issues) {
    if (!Array.isArray(value)) return value

    return value.map((phrase, index) => {
        if (!isPlainObject(phrase)) return phrase

        const sanitized = knownFields(phrase, ACTION_PHRASE_FIELDS)
        if (phrase.title === undefined) {
            sanitized.title = ''
            issues.push({ message: `Missing phrases[${index}].title; using "" in ${path}`, path })
        }
        if (phrase.text === undefined) {
            sanitized.text = ''
            issues.push({ message: `Missing phrases[${index}].text; using "" in ${path}`, path })
        }

        return sanitized
    })
}

function sanitizeOnRules(value, path, issues) {
    if (!Array.isArray(value)) return value

    return value.flatMap((rule, index) => {
        if (!isPlainObject(rule)) return [rule]
        if (rule.actionId === undefined) {
            issues.push({ message: `Missing on[${index}].actionId; dropping rule in ${path}`, path })

            return []
        }

        const sanitized = knownFields(rule, ACTION_ON_RULE_FIELDS)
        if (sanitized.condition === undefined) {
            sanitized.condition = DEFAULT_ON_CONDITION
            issues.push({ message: `Missing on[${index}].condition; using "${DEFAULT_ON_CONDITION}" in ${path}`, path })
        }

        return [sanitized]
    })
}

function sanitizeDefinition(value, path, issues) {
    if (!isPlainObject(value)) return value

    const definition = knownFields(value, ACTION_DEFINITION_FIELDS)
    addMissingString(definition, 'id', defaultActionId(path), path, issues)
    addMissingString(definition, 'label', defaultActionName(path), path, issues)
    addMissingString(definition, 'description', DEFAULT_ACTION_DESCRIPTION, path, issues)
    if (definition.type === undefined) {
        const defaultType = definition.command !== undefined && definition.prompt === undefined ? 'command' : 'agent'
        addMissingString(definition, 'type', defaultType, path, issues)
    }
    if (definition.type === 'agent') addMissingString(definition, 'prompt', DEFAULT_AGENT_PROMPT, path, issues)
    if (definition.type === 'command') addMissingString(definition, 'command', DEFAULT_COMMAND, path, issues)
    if (isPlainObject(definition.appliesTo)) definition.appliesTo = knownFields(definition.appliesTo, ACTION_APPLIES_TO_FIELDS)
    if (isPlainObject(definition.autoFinish)) definition.autoFinish = knownFields(definition.autoFinish, ACTION_AUTO_FINISH_FIELDS)
    if (isPlainObject(definition.output)) definition.output = knownFields(definition.output, ACTION_OUTPUT_FIELDS)
    definition.on = sanitizeOnRules(definition.on, path, issues)
    definition.phrases = sanitizePhrases(definition.phrases, path, issues)

    return definition
}

function issueFromError(error, fallbackPath) {
    const path = error instanceof ActionValidationError ? error.sourcePath ?? fallbackPath : fallbackPath
    const message = error instanceof Error ? error.message : `Invalid action definition in ${path}`

    return { message, path }
}

function parseDefinitions(files, dependencies, issues) {
    const entries = []
    const ids = new Set([BUILTIN_CUSTOM_PROMPT.id, BUILTIN_REMARKABLE_CONVERT.id])
    for (const file of files) {
        try {
            const [parsed] = parseActionDefinitionFiles([file])
            const definition = sanitizeDefinition(parsed.definition, file.path, issues)
            validateActionDefinition(definition, file.path, dependencies)
            if (ids.has(definition.id)) {
                issues.push({ message: `Duplicate action id ${definition.id} in ${file.path}; action skipped`, path: file.path })
                continue
            }
            ids.add(definition.id)
            entries.push({ definition, path: file.path })
        } catch (error) {
            issues.push(issueFromError(error, file.path))
        }
    }

    return entries
}

function removeUnavailableReferences(entries, issues) {
    const availableIds = new Set([
        BUILTIN_CUSTOM_PROMPT.id,
        BUILTIN_REMARKABLE_CONVERT.id,
        ...entries.map(({ definition }) => definition.id),
    ])

    return entries.map(({ definition, path }) => {
        const removeUnavailableIds = (ids, field) => ids?.filter((id, index) => {
            if (availableIds.has(id)) return true
            issues.push({ message: `Unknown action id ${id} in ${path}: ${field}[${index}]; dropping link`, path })

            return false
        })
        const on = definition.on?.filter(({ actionId }, index) => {
            if (availableIds.has(actionId)) return true
            issues.push({ message: `Unknown action id ${actionId} in ${path}: on[${index}]; dropping rule`, path })

            return false
        })

        return {
            definition: {
                ...definition,
                ...(definition.onAfter ? { onAfter: removeUnavailableIds(definition.onAfter, 'onAfter') } : {}),
                ...(definition.onBefore ? { onBefore: removeUnavailableIds(definition.onBefore, 'onBefore') } : {}),
                ...(definition.on ? { on } : {}),
            },
            path,
        }
    })
}

/** Load every usable action while collecting file-level problems for deferred reporting. */
export function loadTolerantActionDefinitionGraph(files, dependencies = {}) {
    const issues = []
    let definitions = parseDefinitions(files, dependencies, issues)

    while (true) {
        definitions = removeUnavailableReferences(definitions, issues)
        try {
            const actions = validateActionDefinitionGraph(definitions, dependencies)

            return { actions, definitions, issues }
        } catch (error) {
            const issue = issueFromError(error, 'unknown action file')
            issues.push(issue)
            const remaining = definitions.filter(({ path }) => path !== issue.path)
            if (remaining.length === definitions.length) {
                return { actions: validateActionDefinitionGraph([], dependencies), definitions: [], issues }
            }
            definitions = remaining
        }
    }
}

export function loadTolerantActionDefinitions(files, dependencies = {}) {
    return loadTolerantActionDefinitionGraph(files, dependencies).actions
}
