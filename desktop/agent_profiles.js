const MODEL_PLACEHOLDER = '{{model}}'
const SESSION_ID_PLACEHOLDER = '{{sessionId}}'

// App TypeScript source is canonical. Keep behavior in sync; desktop parity test enforces this.

const BUILTIN_AGENT_PROFILES = [
    {
        command: 'codex',
        modelArgument: '--model',
        models: [],
        name: 'codex',
        resumeCommand: 'codex resume {{sessionId}}',
        sessionIdPattern: '(?:Session ID|session id|session_id|sessionId)[:= ]+([0-9a-fA-F-]{36})',
    },
    {
        command: 'claude',
        modelArgument: '--model',
        models: [],
        name: 'claude',
        resumeCommand: 'claude --resume {{sessionId}}',
        sessionIdPattern: '(?:Session ID|session id|session_id|sessionId)[:= ]+([0-9a-fA-F-]{36})',
    },
    { command: 'system', models: [], name: 'system' },
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
    if (value === undefined) return undefined
    if (!Array.isArray(value)) throw new Error(`Invalid agent profile field: ${fieldName}`)

    return value.map((model, index) => requireString(model, `${fieldName}[${index}]`))
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

function validateAgentProfiles(value) {
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
        if (defaultModel && models && models.length > 0 && !models.includes(defaultModel)) {
            throw new Error(`Invalid default model for agent profile ${name}: ${defaultModel}`)
        }

        return {
            command: requireString(profile.command, `desktop.agentProfiles[${index}].command`),
            ...(defaultModel !== undefined ? { defaultModel } : {}),
            ...(profile.modelArgument !== undefined ? { modelArgument: requireString(profile.modelArgument, `desktop.agentProfiles[${index}].modelArgument`) } : {}),
            ...(models !== undefined ? { models } : {}),
            name,
            ...(profile.resumeCommand !== undefined ? { resumeCommand: requireString(profile.resumeCommand, `desktop.agentProfiles[${index}].resumeCommand`) } : {}),
            ...(sessionIdPattern !== undefined ? { sessionIdPattern } : {}),
        }
    })
}

function mergeAgentProfiles(profiles) {
    const byName = new Map()
    for (const profile of BUILTIN_AGENT_PROFILES) byName.set(profile.name, profile)
    for (const profile of profiles) byName.set(profile.name, profile)

    return [...byName.values()]
}

function findAgentProfile(profiles, name) {
    return mergeAgentProfiles(profiles).find((profile) => profile.name === name) ?? null
}

function validateAgentSelection(profiles, selection, source) {
    const profile = findAgentProfile(profiles, selection.agent)
    if (!profile) throw new Error(`Unknown agent profile in ${source}: ${selection.agent}`)
    const allowedModels = profile.models ?? []
    if (selection.model.length > 0 && allowedModels.length > 0 && !allowedModels.includes(selection.model)) {
        throw new Error(`Unknown model for agent profile ${selection.agent} in ${source}: ${selection.model}`)
    }
}

function defaultModelForProfile(profile) {
    if (profile.defaultModel !== undefined) return profile.defaultModel

    return profile.models?.[0] ?? ''
}

function buildAgentCommand(profile, model) {
    if (model.length === 0) return profile.command
    if (profile.command.includes(MODEL_PLACEHOLDER)) return profile.command.replaceAll(MODEL_PLACEHOLDER, model)
    if (profile.modelArgument && profile.modelArgument.length > 0) return `${profile.command} ${profile.modelArgument} ${model}`

    return profile.command
}

function buildResumeAgentCommand(profile, sessionId) {
    if (!profile.resumeCommand) throw new Error(`Agent profile does not support native resume: ${profile.name}`)

    return profile.resumeCommand.replaceAll(SESSION_ID_PLACEHOLDER, sessionId)
}

function resolveAgentCommand(config, selection = {}) {
    const agent = selection.agent ?? config.agent
    const profiles = config.agentProfiles ?? []
    const profile = findAgentProfile(profiles, agent)
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`)
    const model = (selection.model ?? config.model) || defaultModelForProfile(profile)
    validateAgentSelection(profiles, { agent, model }, 'desktop config')

    return { agent, command: buildAgentCommand(profile, model), model, profile }
}

module.exports = {
    BUILTIN_AGENT_PROFILES,
    buildAgentCommand,
    buildResumeAgentCommand,
    defaultModelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    resolveAgentCommand,
    validateAgentProfiles,
    validateAgentSelection,
}
