export const MODEL_PLACEHOLDER = '{{model}}'
export const SESSION_ID_PLACEHOLDER = '{{sessionId}}'
export const THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'max']
export const DEFAULT_AGENT_PROFILE_NAME = 'codex'

const CODEX_MAX_THINKING_LEVEL = 'xhigh'

function buildCodexOutputCommand(command, searchEnabled) {
    return [...command, ...(searchEnabled ? ['--search'] : []), 'exec', '--json']
}

function buildClaudeOutputCommand(command) {
    return [...command, '--print', '--verbose', '--output-format', 'stream-json']
}

export const BUILTIN_AGENT_PROFILES = [
    {
        command: ['codex'],
        modelArgument: '--model',
        models: ['GPT 5.5', 'GPT 5.6 sol', 'GPT 5.6 tera', 'GPT 5.6 luna'],
        name: 'codex',
    },
    {
        command: ['claude'],
        modelArgument: '--model',
        models: ['default', 'sonnet', 'fable', 'opus', 'haiku'],
        name: 'claude',
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

function readCommand(value, fieldName) {
    if (!Array.isArray(value)) throw new Error(`Invalid agent profile field: ${fieldName}`)
    if (value.length === 0) throw new Error(`Empty agent profile field: ${fieldName}`)

    return value.map((argument, index) => requireString(argument, `${fieldName}[${index}]`))
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
        if (defaultModel && !models.includes(defaultModel)) {
            throw new Error(`Invalid default model for agent profile ${name}: ${defaultModel}`)
        }

        return {
            command: readCommand(profile.command, `desktop.agentProfiles[${index}].command`),
            ...(defaultModel !== undefined ? { defaultModel } : {}),
            ...(profile.modelArgument !== undefined ? { modelArgument: requireString(profile.modelArgument, `desktop.agentProfiles[${index}].modelArgument`) } : {}),
            models,
            name,
            ...(profile.resumeCommand !== undefined ? { resumeCommand: readCommand(profile.resumeCommand, `desktop.agentProfiles[${index}].resumeCommand`) } : {}),
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
    if (!profile) {
        // Tag with a routing code so callers map the failure to a control without inspecting text.
        const error = new Error(`Unknown agent profile in ${source}: ${selection.agent}`)
        error.code = 'unknown-agent'
        throw error
    }
    let allowedModels
    try {
        allowedModels = readModels(profile.models, `agent profile ${selection.agent}.models`)
    } catch (cause) {
        const error = new Error(`Invalid model list for agent profile ${selection.agent} in ${source}`, { cause })
        error.code = 'invalid-model-list'
        throw error
    }
    if (selection.model.length > 0 && !allowedModels.includes(selection.model)) {
        const error = new Error(`Unknown model for agent profile ${selection.agent} in ${source}: ${selection.model}`)
        error.code = 'unknown-model'
        throw error
    }
}

export function validateThinkingLevel(value, source) {
    if (typeof value !== 'string' || !THINKING_LEVELS.includes(value)) {
        const error = new Error(`Invalid thinking level in ${source}: ${String(value)}`)
        error.code = 'invalid-thinking-level'
        throw error
    }

    return value
}

export function defaultModelForProfile(profile) {
    if (profile.defaultModel !== undefined) return profile.defaultModel

    return profile.models?.[0] ?? ''
}

export function buildAgentCommand(profile, model) {
    if (model.length === 0) return [...profile.command]
    if (profile.command.some((argument) => argument.includes(MODEL_PLACEHOLDER))) {
        return profile.command.map((argument) => argument.replaceAll(MODEL_PLACEHOLDER, model))
    }
    if (profile.modelArgument && profile.modelArgument.length > 0) return [...profile.command, profile.modelArgument, model]

    return [...profile.command]
}

function buildCodexThinkingCommand(command, thinkingLevel) {
    const providerLevel = thinkingLevel === 'max' ? CODEX_MAX_THINKING_LEVEL : thinkingLevel

    return [...command, '-c', `model_reasoning_effort=${providerLevel}`]
}

function buildClaudeThinkingCommand(command, thinkingLevel) {
    return [...command, '--effort', thinkingLevel]
}

const THINKING_LEVEL_ADAPTERS = new Map([
    ['claude', buildClaudeThinkingCommand],
    ['codex', buildCodexThinkingCommand],
])

const OUTPUT_COMMAND_ADAPTERS = new Map([
    ['claude', buildClaudeOutputCommand],
    ['codex', buildCodexOutputCommand],
])

function buildCodexResumeCommand(command, sessionId) {
    const outputArguments = command.slice(-2)
    if (outputArguments[0] !== 'exec' || outputArguments[1] !== '--json') {
        throw new Error('Codex execution command is not structured JSON output')
    }

    return [...command.slice(0, -2), 'exec', 'resume', '--json', sessionId]
}

function buildClaudeResumeCommand(command, sessionId) {
    return [...command, '--resume', sessionId]
}

const RESUME_COMMAND_ADAPTERS = new Map([
    ['claude', buildClaudeResumeCommand],
    ['codex', buildCodexResumeCommand],
])

export function buildAgentExecutionCommand(profile, model, thinkingLevel, searchEnabled = true) {
    const validatedThinkingLevel = validateThinkingLevel(thinkingLevel, `agent profile ${profile.name}`)
    let command = buildAgentCommand(profile, model)

    if (validatedThinkingLevel !== 'none') {
        const thinkingAdapter = THINKING_LEVEL_ADAPTERS.get(profile.name)
        if (!thinkingAdapter) throw new Error(`Agent profile does not support thinking levels: ${profile.name}`)
        command = thinkingAdapter(command, validatedThinkingLevel)
    }

    const outputAdapter = OUTPUT_COMMAND_ADAPTERS.get(profile.name)

    return outputAdapter ? outputAdapter(command, searchEnabled) : command
}

export function buildResumeAgentCommand(profile, sessionId, executionCommand) {
    const resumeAdapter = RESUME_COMMAND_ADAPTERS.get(profile.name)
    if (resumeAdapter) {
        const command = executionCommand ?? buildAgentExecutionCommand(profile, '', 'none', false)

        return resumeAdapter(command, sessionId)
    }
    if (!profile.resumeCommand) throw new Error(`Agent profile does not support native resume: ${profile.name}`)

    return profile.resumeCommand.map((argument) => argument.replaceAll(SESSION_ID_PLACEHOLDER, sessionId))
}
