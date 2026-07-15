const DEFAULT_APP_URL = 'http://localhost:5173'
const DEFAULT_DESKTOP_AGENT = 'codex'
const DEFAULT_AGENT_SLOT_COMMAND = ''
const DEFAULT_DESKTOP_MODEL = ''
const DEFAULT_CODEX_SEARCH_ENABLED = true
const DEFAULT_PROJECT_LOCATION_MODE = 'folder'
const DESKTOP_CONFIG_STORE_KEY = 'desktopConfig'
const { BUILTIN_AGENT_PROFILES, validateAgentProfiles } = require('../actions/agent_profiles.mjs')

function resolveAppUrl(env = process.env) {
    return env.MD2_APP_URL || DEFAULT_APP_URL
}

function originFromUrl(url) {
    return new URL(url).origin
}

function resolveBridgeAllowedOrigins(config, appUrl = resolveAppUrl()) {
    if (Array.isArray(config.bridgeAllowedOrigins) && config.bridgeAllowedOrigins.length > 0) {
        return config.bridgeAllowedOrigins.map((origin) => {
            if (typeof origin !== 'string' || origin.length === 0) throw new Error('Invalid bridgeAllowedOrigins entry')

            return origin
        })
    }

    return [originFromUrl(appUrl)]
}

function resolveDesktopConfig(env = process.env) {
    const agentProfiles = validateAgentProfiles(BUILTIN_AGENT_PROFILES)
    if (env.MD2_AGENT) {
        const defaultProfile = agentProfiles.find((profile) => profile.name === DEFAULT_DESKTOP_AGENT)
        defaultProfile.command = env.MD2_AGENT
    }
    const bridgeAllowedOrigins = env.MD2_BRIDGE_ALLOWED_ORIGINS
        ? env.MD2_BRIDGE_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0)
        : null

    return {
        agent: DEFAULT_DESKTOP_AGENT,
        agentSlotCommand: env.MD2_AGENT_SLOT_COMMAND ?? DEFAULT_AGENT_SLOT_COMMAND,
        agentProfiles,
        codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
        ...(bridgeAllowedOrigins ? { bridgeAllowedOrigins } : {}),
        model: DEFAULT_DESKTOP_MODEL,
        projectLocationMode: env.MD2_PROJECT_LOCATION_MODE || DEFAULT_PROJECT_LOCATION_MODE,
    }
}

function readStoredDesktopConfig(store) {
    return store.get(DESKTOP_CONFIG_STORE_KEY) || {}
}

function applyDefaultAgentProfileModels(agentProfiles) {
    if (!Array.isArray(agentProfiles)) return agentProfiles

    return agentProfiles.map((profile) => {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return profile

        const modelsAreMissing = profile.models === undefined || (Array.isArray(profile.models) && profile.models.length === 0)
        if (!modelsAreMissing) return profile

        const builtInProfile = BUILTIN_AGENT_PROFILES.find(({ name }) => name === profile.name)
        if (!builtInProfile) return profile

        return { ...profile, models: builtInProfile.models }
    })
}

function readDesktopConfig(store, env = process.env) {
    const resolved = { ...resolveDesktopConfig(env), ...readStoredDesktopConfig(store) }
    const profilesWithDefaultModels = applyDefaultAgentProfileModels(resolved.agentProfiles)
    const agentProfiles = validateAgentProfiles(profilesWithDefaultModels)
    if (env.MD2_AGENT) {
        const defaultProfile = agentProfiles.find((profile) => profile.name === DEFAULT_DESKTOP_AGENT)
        if (defaultProfile) defaultProfile.command = env.MD2_AGENT
    }

    return { ...resolved, agentProfiles }
}

function writeDesktopConfig(store, values) {
    const next = { ...readStoredDesktopConfig(store), ...values }
    store.set(DESKTOP_CONFIG_STORE_KEY, next)

    return next
}

module.exports = {
    DEFAULT_APP_URL,
    DEFAULT_AGENT_SLOT_COMMAND,
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_DESKTOP_MODEL,
    DEFAULT_CODEX_SEARCH_ENABLED,
    DEFAULT_PROJECT_LOCATION_MODE,
    DESKTOP_CONFIG_STORE_KEY,
    readDesktopConfig,
    resolveBridgeAllowedOrigins,
    resolveDesktopConfig,
    resolveAppUrl,
    writeDesktopConfig,
}
