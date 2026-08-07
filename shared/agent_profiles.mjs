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

function buildClaudeStreamingCommand(command) {
    return [
        ...buildClaudeOutputCommand(command),
        '--include-partial-messages',
        '--input-format',
        'stream-json',
        '--permission-prompt-tool',
        'stdio',
    ]
}

function buildCodexStreamingCommand(command) {
    return [...command, 'app-server', '--stdio']
}

export const BUILTIN_AGENT_PROFILES = [
    {
        accessLevelArgument: '--sandbox',
        accessLevels: ['read-only', 'workspace-write', 'danger-full-access'],
        approvalPolicies: ['untrusted', 'on-request', 'never'],
        approvalPolicyArgument: '--ask-for-approval',
        command: ['codex'],
        defaultAccessLevel: 'workspace-write',
        defaultApprovalPolicy: 'on-request',
        modelArgument: '--model',
        models: ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
        name: 'codex',
    },
    {
        approvalPolicies: ['default', 'acceptEdits', 'auto', 'dontAsk', 'plan', 'bypassPermissions'],
        approvalPolicyArgument: '--permission-mode',
        command: ['claude'],
        defaultApprovalPolicy: 'default',
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

function readCapability(profile, profileName, choicesField, argumentField, defaultField, label) {
    const choices = profile[choicesField]
    const argument = profile[argumentField]
    const defaultValue = profile[defaultField]
    if (choices === undefined) {
        if (argument !== undefined || defaultValue !== undefined) throw new Error(`Missing agent profile field: ${choicesField}`)

        return {}
    }

    const validatedChoices = readModels(choices, `${profileName}.${choicesField}`)
    const validatedArgument = requireString(argument, `${profileName}.${argumentField}`)
    const validatedDefault = requireString(defaultValue, `${profileName}.${defaultField}`)
    if (!validatedChoices.includes(validatedDefault)) {
        throw new Error(`Invalid default ${label} for agent profile ${profile.name}: ${validatedDefault}`)
    }

    return { [argumentField]: validatedArgument, [choicesField]: validatedChoices, [defaultField]: validatedDefault }
}

function validateAgentProfile(profile, index, names) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`Invalid agent profile: ${index}`)
    const name = requireString(profile.name, `desktop.agentProfiles[${index}].name`)
    if (names.has(name)) throw new Error(`Duplicate agent profile: ${name}`)

    const models = readModels(profile.models, `desktop.agentProfiles[${index}].models`)
    const defaultModel = readOptionalString(profile.defaultModel, `desktop.agentProfiles[${index}].defaultModel`)
    if (defaultModel && !models.includes(defaultModel)) {
        throw new Error(`Invalid default model for agent profile ${name}: ${defaultModel}`)
    }

    const profileName = `desktop.agentProfiles[${index}]`
    const accessLevelCapability = readCapability(profile, profileName, 'accessLevels', 'accessLevelArgument', 'defaultAccessLevel', 'access level')
    const approvalPolicyCapability = readCapability(profile, profileName, 'approvalPolicies', 'approvalPolicyArgument', 'defaultApprovalPolicy', 'approval policy')
    const validated = {
        ...accessLevelCapability,
        ...approvalPolicyCapability,
        command: readCommand(profile.command, `desktop.agentProfiles[${index}].command`),
        ...(defaultModel !== undefined ? { defaultModel } : {}),
        ...(profile.modelArgument !== undefined ? { modelArgument: requireString(profile.modelArgument, `desktop.agentProfiles[${index}].modelArgument`) } : {}),
        models,
        name,
        ...(profile.resumeCommand !== undefined ? { resumeCommand: readCommand(profile.resumeCommand, `desktop.agentProfiles[${index}].resumeCommand`) } : {}),
    }
    names.add(name)

    return validated
}

export function validateAgentProfiles(value) {
    if (!Array.isArray(value)) throw new Error('Missing config field: desktop.agentProfiles')

    const names = new Set()

    return value.map((profile, index) => validateAgentProfile(profile, index, names))
}

// Tolerant variant for reading persisted config: invalid entries are dropped instead of
// failing app startup, and the built-ins are used when nothing valid remains.
export function normalizeAgentProfiles(value) {
    if (!Array.isArray(value)) return structuredClone(BUILTIN_AGENT_PROFILES)

    const names = new Set()
    const profiles = []
    for (const [index, profile] of value.entries()) {
        try {
            profiles.push(validateAgentProfile(profile, index, names))
        } catch {
            // drop the invalid profile
        }
    }

    return profiles.length > 0 ? profiles : structuredClone(BUILTIN_AGENT_PROFILES)
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
    validateCapabilitySelection(profile, selection.accessLevel, 'accessLevels', 'access level', source)
    validateCapabilitySelection(profile, selection.approvalPolicy, 'approvalPolicies', 'approval policy', source)
}

function validateCapabilitySelection(profile, value, choicesField, label, source) {
    if (value === undefined) return
    const codeName = choicesField === 'accessLevels' ? 'access-level' : 'approval-policy'
    if (typeof value !== 'string' || value.length === 0) {
        const error = new Error(`Invalid ${label} in ${source}: ${String(value)}`)
        error.code = `invalid-${codeName}`
        throw error
    }
    const choices = profile[choicesField]
    if (!choices) {
        const error = new Error(`Agent profile does not support ${label}: ${profile.name}`)
        error.code = `unsupported-${codeName}`
        throw error
    }
    if (!choices.includes(value)) {
        const error = new Error(`Unknown ${label} for agent profile ${profile.name} in ${source}: ${value}`)
        error.code = `unknown-${codeName}`
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

export function defaultAccessLevelForProfile(profile) {
    return profile.defaultAccessLevel ?? null
}

export function defaultApprovalPolicyForProfile(profile) {
    return profile.defaultApprovalPolicy ?? null
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

function buildCapabilityCommand(command, profile, selection) {
    let result = command
    if (selection.accessLevel !== undefined) {
        const argument = requireString(profile.accessLevelArgument, `agent profile ${profile.name}.accessLevelArgument`)
        result = [...result, argument, selection.accessLevel]
    }
    if (selection.approvalPolicy !== undefined) {
        const argument = requireString(profile.approvalPolicyArgument, `agent profile ${profile.name}.approvalPolicyArgument`)
        result = [...result, argument, selection.approvalPolicy]
    }

    return result
}

const THINKING_LEVEL_ADAPTERS = new Map([
    ['claude', buildClaudeThinkingCommand],
    ['codex', buildCodexThinkingCommand],
])

const OUTPUT_COMMAND_ADAPTERS = new Map([
    ['claude', buildClaudeOutputCommand],
    ['codex', buildCodexOutputCommand],
])

const STREAMING_COMMAND_ADAPTERS = new Map([
    ['claude', buildClaudeStreamingCommand],
    ['codex', buildCodexStreamingCommand],
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

export function buildAgentExecutionCommand(profile, model, thinkingLevel, searchEnabled = true, capabilities = {}) {
    const validatedThinkingLevel = validateThinkingLevel(thinkingLevel, `agent profile ${profile.name}`)
    validateCapabilitySelection(profile, capabilities.accessLevel, 'accessLevels', 'access level', `agent profile ${profile.name}`)
    validateCapabilitySelection(profile, capabilities.approvalPolicy, 'approvalPolicies', 'approval policy', `agent profile ${profile.name}`)
    let command = buildAgentCommand(profile, model)

    if (validatedThinkingLevel !== 'none') {
        const thinkingAdapter = THINKING_LEVEL_ADAPTERS.get(profile.name)
        if (!thinkingAdapter) throw new Error(`Agent profile does not support thinking levels: ${profile.name}`)
        command = thinkingAdapter(command, validatedThinkingLevel)
    }
    command = buildCapabilityCommand(command, profile, capabilities)

    const outputAdapter = OUTPUT_COMMAND_ADAPTERS.get(profile.name)

    return outputAdapter ? outputAdapter(command, searchEnabled) : command
}

export function supportsAgentStreaming(profile) {
    return STREAMING_COMMAND_ADAPTERS.has(profile.name)
}

export function buildAgentStreamingCommand(profile, model, thinkingLevel, capabilities = {}) {
    if (!supportsAgentStreaming(profile)) throw new Error(`Agent profile does not support streaming: ${profile.name}`)
    const validatedThinkingLevel = validateThinkingLevel(thinkingLevel, `agent profile ${profile.name}`)
    validateCapabilitySelection(profile, capabilities.accessLevel, 'accessLevels', 'access level', `agent profile ${profile.name}`)
    validateCapabilitySelection(profile, capabilities.approvalPolicy, 'approvalPolicies', 'approval policy', `agent profile ${profile.name}`)
    let command = buildAgentCommand(profile, model)

    if (validatedThinkingLevel !== 'none') {
        const thinkingAdapter = THINKING_LEVEL_ADAPTERS.get(profile.name)
        if (!thinkingAdapter) throw new Error(`Agent profile does not support thinking levels: ${profile.name}`)
        command = thinkingAdapter(command, validatedThinkingLevel)
    }
    command = buildCapabilityCommand(command, profile, capabilities)

    return STREAMING_COMMAND_ADAPTERS.get(profile.name)(command)
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
