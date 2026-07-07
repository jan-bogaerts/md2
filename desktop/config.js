const DEFAULT_APP_URL = 'http://localhost:5173'
const DEFAULT_DESKTOP_AGENT = 'codex'
const DEFAULT_DESKTOP_MODEL = ''
const DEFAULT_PROJECT_LOCATION_MODE = 'folder'
const DESKTOP_CONFIG_STORE_KEY = 'desktopConfig'
const { BUILTIN_AGENT_PROFILES, validateAgentProfiles } = require('./agent_profiles')

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
        agentProfiles,
        ...(bridgeAllowedOrigins ? { bridgeAllowedOrigins } : {}),
        model: DEFAULT_DESKTOP_MODEL,
        projectLocationMode: env.MD2_PROJECT_LOCATION_MODE || DEFAULT_PROJECT_LOCATION_MODE,
    }
}

function readStoredDesktopConfig(store) {
    return store.get(DESKTOP_CONFIG_STORE_KEY) || {}
}

function readDesktopConfig(store, env = process.env) {
    const resolved = { ...resolveDesktopConfig(env), ...readStoredDesktopConfig(store) }
    const agentProfiles = validateAgentProfiles(resolved.agentProfiles)
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
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_DESKTOP_MODEL,
    DEFAULT_PROJECT_LOCATION_MODE,
    DESKTOP_CONFIG_STORE_KEY,
    readDesktopConfig,
    resolveBridgeAllowedOrigins,
    resolveDesktopConfig,
    resolveAppUrl,
    writeDesktopConfig,
}
