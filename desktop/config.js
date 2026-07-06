const DEFAULT_APP_URL = 'http://localhost:5173'
const DEFAULT_DESKTOP_AGENT = 'codex'
const DEFAULT_PROJECT_LOCATION_MODE = 'folder'
const DESKTOP_CONFIG_STORE_KEY = 'desktopConfig'

function resolveAppUrl(env = process.env) {
    return env.MD2_APP_URL || DEFAULT_APP_URL
}

function resolveDesktopConfig(env = process.env) {
    return {
        agent: env.MD2_AGENT || DEFAULT_DESKTOP_AGENT,
        projectLocationMode: env.MD2_PROJECT_LOCATION_MODE || DEFAULT_PROJECT_LOCATION_MODE,
    }
}

function readStoredDesktopConfig(store) {
    return store.get(DESKTOP_CONFIG_STORE_KEY) || {}
}

function readDesktopConfig(store, env = process.env) {
    return { ...resolveDesktopConfig(env), ...readStoredDesktopConfig(store) }
}

function writeDesktopConfig(store, values) {
    const next = { ...readStoredDesktopConfig(store), ...values }
    store.set(DESKTOP_CONFIG_STORE_KEY, next)

    return next
}

module.exports = {
    DEFAULT_APP_URL,
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_PROJECT_LOCATION_MODE,
    DESKTOP_CONFIG_STORE_KEY,
    readDesktopConfig,
    resolveDesktopConfig,
    resolveAppUrl,
    writeDesktopConfig,
}
