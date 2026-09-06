export const MODEL_PLACEHOLDER = '{{model}}'
export const SESSION_ID_PLACEHOLDER = '{{sessionId}}'
export const THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'max']
export const DEFAULT_AGENT_PROFILE_NAME = 'codex'
export const PERMISSION_MODES = ['ask-for-approval', 'approve-for-me', 'full-access']
export const DEFAULT_PERMISSION_MODE = 'ask-for-approval'
export const PERMISSION_MODE_OPTIONS = [
    {
        description: 'Ask before commands or file changes cross the normal approval boundary.',
        label: 'Ask for approval',
        value: 'ask-for-approval',
    },
    {
        description: 'Let the provider safety reviewer approve changes automatically.',
        label: 'Approve for me',
        value: 'approve-for-me',
    },
    {
        description: 'Disable the normal approval boundary and allow unrestricted access.',
        label: 'Full access — disables approvals',
        value: 'full-access',
    },
]

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
        command: ['codex'],
        defaultModel: 'gpt-5.6-sol',
        defaultThinkingLevel: 'medium',
        modelArgument: '--model',
        models: ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
        name: 'codex',
    },
    {
        command: ['claude'],
        defaultModel: 'default',
        defaultThinkingLevel: 'medium',
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

function readOptionalPositiveNumber(value, fieldName) {
    if (value === undefined) return undefined
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid agent profile field: ${fieldName}`)
    }

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

function validateAgentProfile(profile, index, names) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`Invalid agent profile: ${index}`)
    const name = requireString(profile.name, `desktop.agentProfiles[${index}].name`)
    if (names.has(name)) throw new Error(`Duplicate agent profile: ${name}`)

    const models = readModels(profile.models, `desktop.agentProfiles[${index}].models`)
    const defaultModel = readOptionalString(profile.defaultModel, `desktop.agentProfiles[${index}].defaultModel`)
    const monthlySubscriptionCostUsd = readOptionalPositiveNumber(
        profile.monthlySubscriptionCostUsd,
        `desktop.agentProfiles[${index}].monthlySubscriptionCostUsd`,
    )
    if (defaultModel && !models.includes(defaultModel)) {
        throw new Error(`Invalid default model for agent profile ${name}: ${defaultModel}`)
    }
    const defaultThinkingLevel = validateThinkingLevel(
        profile.defaultThinkingLevel,
        `desktop.agentProfiles[${index}].defaultThinkingLevel`,
    )
    if (!supportsThinkingLevel({ name }, defaultThinkingLevel)) {
        throw new Error(`Agent profile does not support default thinking level ${defaultThinkingLevel}: ${name}`)
    }

    const validated = {
        command: readCommand(profile.command, `desktop.agentProfiles[${index}].command`),
        ...(defaultModel !== undefined ? { defaultModel } : {}),
        defaultThinkingLevel,
        ...(profile.modelArgument !== undefined ? { modelArgument: requireString(profile.modelArgument, `desktop.agentProfiles[${index}].modelArgument`) } : {}),
        ...(monthlySubscriptionCostUsd !== undefined ? { monthlySubscriptionCostUsd } : {}),
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

/** Adds required fields introduced after legacy desktop profiles were persisted. */
export function migrateAgentProfiles(value) {
    if (!Array.isArray(value)) return value

    return value.map((profile) => profile && typeof profile === 'object' && !Array.isArray(profile)
        && profile.defaultThinkingLevel === undefined
        ? { ...profile, defaultThinkingLevel: 'none' }
        : profile)
}

// Tolerant variant for reading persisted config: invalid entries are dropped instead of
// failing app startup, and the built-ins are used when nothing valid remains.
export function normalizeAgentProfiles(value) {
    if (!Array.isArray(value)) return structuredClone(BUILTIN_AGENT_PROFILES)

    const names = new Set()
    const profiles = []
    for (const [index, profile] of migrateAgentProfiles(value).entries()) {
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
    if (selection.thinkingLevel !== undefined) {
        const thinkingLevel = validateThinkingLevel(selection.thinkingLevel, source)
        if (!supportsThinkingLevel(profile, thinkingLevel)) {
            const error = new Error(`Agent profile does not support thinking level ${thinkingLevel}: ${profile.name}`)
            error.code = 'unsupported-thinking-level'
            throw error
        }
    }
    if (selection.permissionMode !== undefined) {
        validatePermissionMode(selection.permissionMode, source)
        if (!supportsPermissionMode(profile)) {
            const error = new Error(`Agent profile does not support permission modes: ${profile.name}`)
            error.code = 'unsupported-permission-mode'
            throw error
        }
    }
}

export function validatePermissionMode(value, source) {
    if (typeof value !== 'string' || !PERMISSION_MODES.includes(value)) {
        const error = new Error(`Invalid permission mode in ${source}: ${String(value)}`)
        error.code = 'invalid-permission-mode'
        throw error
    }

    return value
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

export function defaultThinkingLevelForProfile(profile) {
    return validateThinkingLevel(profile.defaultThinkingLevel, `agent profile ${profile.name}.defaultThinkingLevel`)
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

const PERMISSION_MODE_ARGUMENTS = new Map([
    ['claude', new Map([
        ['ask-for-approval', ['--permission-mode', 'acceptEdits']],
        ['approve-for-me', ['--permission-mode', 'auto']],
        ['full-access', ['--permission-mode', 'bypassPermissions']],
    ])],
    ['codex', new Map([
        ['ask-for-approval', ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']],
        ['approve-for-me', ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '-c', 'approvals_reviewer=auto_review']],
        ['full-access', ['--sandbox', 'danger-full-access', '--ask-for-approval', 'never']],
    ])],
])

export function supportsPermissionMode(profile) {
    return PERMISSION_MODE_ARGUMENTS.has(profile.name)
}

function buildPermissionModeCommand(command, profile, permissionMode) {
    if (permissionMode === undefined) return command
    const validatedPermissionMode = validatePermissionMode(permissionMode, `agent profile ${profile.name}`)
    const adapter = PERMISSION_MODE_ARGUMENTS.get(profile.name)
    if (!adapter) throw new Error(`Agent profile does not support permission modes: ${profile.name}`)

    return [...command, ...adapter.get(validatedPermissionMode)]
}

const THINKING_LEVEL_ADAPTERS = new Map([
    ['claude', buildClaudeThinkingCommand],
    ['codex', buildCodexThinkingCommand],
])

export function supportsThinkingLevel(profile, thinkingLevel) {
    const validatedThinkingLevel = validateThinkingLevel(thinkingLevel, `agent profile ${profile.name}`)

    return validatedThinkingLevel === 'none' || THINKING_LEVEL_ADAPTERS.has(profile.name)
}

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

export function buildAgentExecutionCommand(profile, model, thinkingLevel, searchEnabled = true, permissionMode = undefined) {
    const validatedThinkingLevel = validateThinkingLevel(thinkingLevel, `agent profile ${profile.name}`)
    let command = buildAgentCommand(profile, model)

    if (validatedThinkingLevel !== 'none') {
        const thinkingAdapter = THINKING_LEVEL_ADAPTERS.get(profile.name)
        if (!thinkingAdapter) throw new Error(`Agent profile does not support thinking levels: ${profile.name}`)
        command = thinkingAdapter(command, validatedThinkingLevel)
    }
    command = buildPermissionModeCommand(command, profile, permissionMode)

    const outputAdapter = OUTPUT_COMMAND_ADAPTERS.get(profile.name)

    return outputAdapter ? outputAdapter(command, searchEnabled) : command
}

export function supportsAgentStreaming(profile) {
    return STREAMING_COMMAND_ADAPTERS.has(profile.name)
}

export function buildAgentStreamingCommand(profile, model, thinkingLevel, permissionMode = undefined) {
    if (!supportsAgentStreaming(profile)) throw new Error(`Agent profile does not support streaming: ${profile.name}`)
    const validatedThinkingLevel = validateThinkingLevel(thinkingLevel, `agent profile ${profile.name}`)
    let command = buildAgentCommand(profile, model)

    if (validatedThinkingLevel !== 'none') {
        const thinkingAdapter = THINKING_LEVEL_ADAPTERS.get(profile.name)
        if (!thinkingAdapter) throw new Error(`Agent profile does not support thinking levels: ${profile.name}`)
        command = thinkingAdapter(command, validatedThinkingLevel)
    }
    command = buildPermissionModeCommand(command, profile, permissionMode)

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
