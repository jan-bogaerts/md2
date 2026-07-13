export const MODEL_PLACEHOLDER = '{{model}}'
export const SESSION_ID_PLACEHOLDER = '{{sessionId}}'
export const THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'max']
export const DEFAULT_AGENT_PROFILE_NAME = 'codex'

const CODEX_MAX_THINKING_LEVEL = 'xhigh'

export const BUILTIN_AGENT_PROFILES = [
    {
        command: 'codex',
        modelArgument: '--model',
        models: ['GPT 5.5', 'GPT 5.6 sol', 'GPT 5.6 tera', 'GPT 5.6 luna'],
        name: 'codex',
        resumeCommand: 'codex resume {{sessionId}}',
        sessionIdPattern: '(?:Session ID|session id|session_id|sessionId)[:= ]+([0-9a-fA-F-]{36})',
    },
    {
        command: 'claude',
        modelArgument: '--model',
        models: ['default', 'sonnet', 'fable', 'opus', 'haiku'],
        name: 'claude',
        resumeCommand: 'claude --resume {{sessionId}}',
        sessionIdPattern: '(?:Session ID|session id|session_id|sessionId)[:= ]+([0-9a-fA-F-]{36})',
    },
]

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing agent profile field: ${fieldName}`)

    return value
}

function readOptionalString(value, fieldName) {
    if (value === undefined) return undefined
    if (typeof value !== 'string') throw new Error(`Invalid agent profile field: ${fieldName}`)

    return value
}

function readModels(value, fieldName) {
    if (!Array.isArray(value)) throw new Error(`Invalid agent profile field: ${fieldName}`)
    if (value.length === 0) throw new Error(`Empty agent profile field: ${fieldName}`)

    const models = value.map((model, index) => {
        const validatedModel = requireString(model, `${fieldName}[${index}]`)
        if (validatedModel.trim() !== validatedModel) throw new Error(`Invalid agent profile field: ${fieldName}[${index}]`)

        return validatedModel
    })
    if (new Set(models).size !== models.length) throw new Error(`Duplicate agent profile model in: ${fieldName}`)

    return models
}

function readOptionalPattern(value, fieldName) {
    const pattern = readOptionalString(value, fieldName)
    if (pattern === undefined) return undefined

    try {
        new RegExp(pattern, 'u')
    } catch {
        throw new Error(`Invalid agent profile field: ${fieldName}`)
    }

    return pattern
}

export function validateAgentProfiles(value) {
    if (!Array.isArray(value)) throw new Error('Missing config field: desktop.agentProfiles')

    const names = new Set()

    return value.map((profile, index) => {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`Invalid agent profile: ${index}`)
        const name = requireString(profile.name, `desktop.agentProfiles[${index}].name`)
        if (names.has(name)) throw new Error(`Duplicate agent profile: ${name}`)
        names.add(name)

        const models = readModels(profile.models, `desktop.agentProfiles[${index}].models`)
        const defaultModel = readOptionalString(profile.defaultModel, `desktop.agentProfiles[${index}].defaultModel`)
        const sessionIdPattern = readOptionalPattern(profile.sessionIdPattern, `desktop.agentProfiles[${index}].sessionIdPattern`)
        if (defaultModel && !models.includes(defaultModel)) {
            throw new Error(`Invalid default model for agent profile ${name}: ${defaultModel}`)
        }

        return {
            command: requireString(profile.command, `desktop.agentProfiles[${index}].command`),
            ...(defaultModel !== undefined ? { defaultModel } : {}),
            ...(profile.modelArgument !== undefined ? { modelArgument: requireString(profile.modelArgument, `desktop.agentProfiles[${index}].modelArgument`) } : {}),
            models,
            name,
            ...(profile.resumeCommand !== undefined ? { resumeCommand: requireString(profile.resumeCommand, `desktop.agentProfiles[${index}].resumeCommand`) } : {}),
            ...(sessionIdPattern !== undefined ? { sessionIdPattern } : {}),
        }
    })
}

export function mergeAgentProfiles(profiles) {
    const byName = new Map()
    for (const profile of BUILTIN_AGENT_PROFILES) byName.set(profile.name, profile)
    for (const profile of profiles) byName.set(profile.name, profile)

    return [...byName.values()]
}

export function findAgentProfile(profiles, name) {
    return mergeAgentProfiles(profiles).find((profile) => profile.name === name) ?? null
}

export function validateAgentSelection(profiles, selection, source) {
    const profile = findAgentProfile(profiles, selection.agent)
    if (!profile) throw new Error(`Unknown agent profile in ${source}: ${selection.agent}`)
    const allowedModels = profile.models ?? []
    if (selection.model.length > 0 && allowedModels.length > 0 && !allowedModels.includes(selection.model)) {
        throw new Error(`Unknown model for agent profile ${selection.agent} in ${source}: ${selection.model}`)
    }
}

export function validateThinkingLevel(value, source) {
    if (typeof value !== 'string' || !THINKING_LEVELS.includes(value)) {
        throw new Error(`Invalid thinking level in ${source}: ${String(value)}`)
    }

    return value
}

export function defaultModelForProfile(profile) {
    if (profile.defaultModel !== undefined) return profile.defaultModel

    return profile.models?.[0] ?? ''
}

export function buildAgentCommand(profile, model) {
    if (model.length === 0) return profile.command
    if (profile.command.includes(MODEL_PLACEHOLDER)) return profile.command.replaceAll(MODEL_PLACEHOLDER, model)
    if (profile.modelArgument && profile.modelArgument.length > 0) return `${profile.command} ${profile.modelArgument} ${model}`

    return profile.command
}

function buildCodexThinkingCommand(command, thinkingLevel) {
    const providerLevel = thinkingLevel === 'max' ? CODEX_MAX_THINKING_LEVEL : thinkingLevel

    return `${command} -c model_reasoning_effort=${providerLevel}`
}

function buildClaudeThinkingCommand(command, thinkingLevel) {
    return `${command} --effort ${thinkingLevel}`
}

const THINKING_LEVEL_ADAPTERS = new Map([
    ['claude', buildClaudeThinkingCommand],
    ['codex', buildCodexThinkingCommand],
])

export function buildAgentExecutionCommand(profile, model, thinkingLevel) {
    const validatedThinkingLevel = validateThinkingLevel(thinkingLevel, `agent profile ${profile.name}`)
    const command = buildAgentCommand(profile, model)
    if (validatedThinkingLevel === 'none') return command

    const adapter = THINKING_LEVEL_ADAPTERS.get(profile.name)
    if (!adapter) throw new Error(`Agent profile does not support thinking levels: ${profile.name}`)

    return adapter(command, validatedThinkingLevel)
}

export function buildResumeAgentCommand(profile, sessionId) {
    if (!profile.resumeCommand) throw new Error(`Agent profile does not support native resume: ${profile.name}`)

    return profile.resumeCommand.replaceAll(SESSION_ID_PLACEHOLDER, sessionId)
}
