import {
    DEFAULT_AGENT_PROFILE_NAME,
    DEFAULT_PERMISSION_MODE,
    defaultModelForProfile,
    defaultThinkingLevelForProfile,
    findAgentProfile,
    supportsPermissionMode,
    validatePermissionMode,
    validateThinkingLevel,
    validateSpeedMode,
} from './agent_profiles.mjs'

const defaultProfile = findAgentProfile([], DEFAULT_AGENT_PROFILE_NAME)
if (!defaultProfile) throw new Error(`Missing built-in agent profile: ${DEFAULT_AGENT_PROFILE_NAME}`)

export const DEFAULT_AGENT_SELECTION = {
    activeAgent: DEFAULT_AGENT_PROFILE_NAME,
    permissionMode: DEFAULT_PERMISSION_MODE,
    settingsByAgent: { [DEFAULT_AGENT_PROFILE_NAME]: profileAgentSettings(defaultProfile) },
}

function requireObject(value, source) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid agent selection in ${source}`)

    return value
}

function requireString(value, fieldName, allowEmpty = false) {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new Error(`Invalid agent selection field: ${fieldName}`)

    return value
}

export function profileAgentSettings(profile) {
    return {
        model: defaultModelForProfile(profile),
        thinkingLevel: defaultThinkingLevelForProfile(profile),
    }
}

export function validateAgentSettings(value, source) {
    const settings = requireObject(value, source)

    return {
        model: requireString(settings.model, `${source}.model`, true),
        thinkingLevel: validateThinkingLevel(settings.thinkingLevel, `${source}.thinkingLevel`),
        ...(settings.speedMode !== undefined ? { speedMode: validateSpeedMode(settings.speedMode, `${source}.speedMode`) } : {}),
    }
}

export function validateAgentSelectionState(value, source, allowEmptyPermissionMode = false) {
    const selection = requireObject(value, source)
    const activeAgent = requireString(selection.activeAgent, `${source}.activeAgent`)
    const permissionMode = requireString(selection.permissionMode, `${source}.permissionMode`, allowEmptyPermissionMode)
    if (permissionMode.length > 0) validatePermissionMode(permissionMode, `${source}.permissionMode`)
    const rawSettingsByAgent = requireObject(selection.settingsByAgent, `${source}.settingsByAgent`)
    const settingsByAgent = Object.fromEntries(Object.entries(rawSettingsByAgent).map(([agent, settings]) => [
        requireString(agent, `${source}.settingsByAgent agent`),
        validateAgentSettings(settings, `${source}.settingsByAgent.${agent}`),
    ]))

    return { activeAgent, permissionMode, settingsByAgent }
}

export function resolveAgentSettings(agent, profiles, sources = []) {
    const remembered = sources.find((source) => source?.settingsByAgent && Object.hasOwn(source.settingsByAgent, agent))
    if (remembered) {
        const speedMode = sources.find((source) => source?.settingsByAgent?.[agent]?.speedMode !== undefined)
            ?.settingsByAgent[agent].speedMode;

        return speedMode === undefined ? remembered.settingsByAgent[agent] : { ...remembered.settingsByAgent[agent], speedMode };
    }

    const profile = findAgentProfile(profiles, agent)
    if (!profile) return { model: '', thinkingLevel: 'none' }

    return profileAgentSettings(profile)
}

export function resolveAgentSelectionState(selection, profiles, fallbackSources = []) {
    const currentSettings = selection.settingsByAgent[selection.activeAgent];
    const activeSettings = resolveAgentSettings(selection.activeAgent, profiles, [selection, ...fallbackSources]);
    if (currentSettings && currentSettings.speedMode === activeSettings.speedMode) return selection;

    return {
        ...selection,
        settingsByAgent: { ...selection.settingsByAgent, [selection.activeAgent]: activeSettings },
    }
}

export function selectSpeedMode(selection, speedMode) {
    const current = selection.settingsByAgent[selection.activeAgent];
    if (!current) throw new Error(`Missing settings for active agent: ${selection.activeAgent}`);
    const validated = validateSpeedMode(speedMode, 'agent selection');
    if (selection.activeAgent !== 'codex' && validated !== 'default') {
        throw new Error(`Speed settings are unsupported for ${selection.activeAgent}`);
    }

    return {
        ...selection,
        settingsByAgent: { ...selection.settingsByAgent, [selection.activeAgent]: { ...current, speedMode: validated } },
    };
}

export function selectAgent(selection, agent, profiles, fallbackSources = []) {
    const next = { ...selection, activeAgent: agent }

    return resolveAgentSelectionState(next, profiles, fallbackSources)
}

export function selectModel(selection, model) {
    const current = selection.settingsByAgent[selection.activeAgent]
    if (!current) throw new Error(`Missing settings for active agent: ${selection.activeAgent}`)

    return {
        ...selection,
        settingsByAgent: { ...selection.settingsByAgent, [selection.activeAgent]: { ...current, model } },
    }
}

export function selectThinkingLevel(selection, thinkingLevel) {
    const current = selection.settingsByAgent[selection.activeAgent]
    if (!current) throw new Error(`Missing settings for active agent: ${selection.activeAgent}`)
    const validated = validateThinkingLevel(thinkingLevel, `agent selection ${selection.activeAgent}`)

    return {
        ...selection,
        settingsByAgent: {
            ...selection.settingsByAgent,
            [selection.activeAgent]: { ...current, thinkingLevel: validated },
        },
    }
}

export function selectPermissionMode(selection, permissionMode) {
    return { ...selection, permissionMode: validatePermissionMode(permissionMode, 'agent selection') }
}

export function projectAgentSelection(selection, profiles = []) {
    const settings = selection.settingsByAgent[selection.activeAgent]
    if (!settings) throw new Error(`Missing settings for active agent: ${selection.activeAgent}`)
    const profile = findAgentProfile(profiles, selection.activeAgent)

    return {
        agent: selection.activeAgent,
        model: settings.model,
        ...(profile && supportsPermissionMode(profile) ? { permissionMode: selection.permissionMode } : {}),
        thinkingLevel: settings.thinkingLevel,
        ...(settings.speedMode !== undefined ? { speedMode: settings.speedMode } : {}),
    }
}
