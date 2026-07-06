export interface AgentProfile {
    command: string
    defaultModel?: string
    modelArgument?: string
    models?: string[]
    name: string
}

export interface AgentSelection {
    agent: string
    model: string
}

export const MODEL_PLACEHOLDER = '{{model}}'

export const BUILTIN_AGENT_PROFILES: AgentProfile[] = [
    { command: 'codex', modelArgument: '--model', models: [], name: 'codex' },
    { command: 'claude', modelArgument: '--model', models: [], name: 'claude' },
    { command: 'system', models: [], name: 'system' },
]

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing agent profile field: ${fieldName}`)

    return value
}

function readOptionalString(value: unknown, fieldName: string) {
    if (value === undefined) return undefined
    if (typeof value !== 'string') throw new Error(`Invalid agent profile field: ${fieldName}`)

    return value
}

function readModels(value: unknown, fieldName: string) {
    if (value === undefined) return undefined
    if (!Array.isArray(value)) throw new Error(`Invalid agent profile field: ${fieldName}`)

    return value.map((model, index) => requireString(model, `${fieldName}[${index}]`))
}

export function validateAgentProfiles(value: unknown): AgentProfile[] {
    if (!Array.isArray(value)) throw new Error('Missing config field: desktop.agentProfiles')

    const names = new Set<string>()

    return value.map((profile, index) => {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`Invalid agent profile: ${index}`)
        const item = profile as Partial<AgentProfile>
        const name = requireString(item.name, `desktop.agentProfiles[${index}].name`)
        if (names.has(name)) throw new Error(`Duplicate agent profile: ${name}`)
        names.add(name)

        const models = readModels(item.models, `desktop.agentProfiles[${index}].models`)
        const defaultModel = readOptionalString(item.defaultModel, `desktop.agentProfiles[${index}].defaultModel`)
        if (defaultModel && models && models.length > 0 && !models.includes(defaultModel)) {
            throw new Error(`Invalid default model for agent profile ${name}: ${defaultModel}`)
        }

        return {
            command: requireString(item.command, `desktop.agentProfiles[${index}].command`),
            ...(defaultModel !== undefined ? { defaultModel } : {}),
            ...(item.modelArgument !== undefined ? { modelArgument: requireString(item.modelArgument, `desktop.agentProfiles[${index}].modelArgument`) } : {}),
            ...(models !== undefined ? { models } : {}),
            name,
        }
    })
}

export function mergeAgentProfiles(profiles: AgentProfile[]) {
    const byName = new Map<string, AgentProfile>()
    for (const profile of BUILTIN_AGENT_PROFILES) byName.set(profile.name, profile)
    for (const profile of profiles) byName.set(profile.name, profile)

    return [...byName.values()]
}

export function findAgentProfile(profiles: AgentProfile[], name: string) {
    return mergeAgentProfiles(profiles).find((profile) => profile.name === name) ?? null
}

export function validateAgentSelection(profiles: AgentProfile[], selection: AgentSelection, source: string) {
    const profile = findAgentProfile(profiles, selection.agent)
    if (!profile) throw new Error(`Unknown agent profile in ${source}: ${selection.agent}`)
    const allowedModels = profile.models ?? []
    if (selection.model.length > 0 && allowedModels.length > 0 && !allowedModels.includes(selection.model)) {
        throw new Error(`Unknown model for agent profile ${selection.agent} in ${source}: ${selection.model}`)
    }
}

export function defaultModelForProfile(profile: AgentProfile) {
    if (profile.defaultModel !== undefined) return profile.defaultModel

    return profile.models?.[0] ?? ''
}

export function buildAgentCommand(profile: AgentProfile, model: string) {
    if (model.length === 0) return profile.command
    if (profile.command.includes(MODEL_PLACEHOLDER)) return profile.command.replaceAll(MODEL_PLACEHOLDER, model)
    if (profile.modelArgument && profile.modelArgument.length > 0) return `${profile.command} ${profile.modelArgument} ${model}`

    return profile.command
}
