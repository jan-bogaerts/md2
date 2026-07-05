const DEFAULT_APP_URL = 'http://localhost:5173'
const DEFAULT_DESKTOP_AGENT = 'codex'
const DEFAULT_PROJECT_LOCATION_MODE = 'folder'

function resolveAppUrl(env = process.env) {
    return env.MD2_APP_URL || DEFAULT_APP_URL
}

function resolveDesktopConfig(env = process.env) {
    return {
        agent: env.MD2_AGENT || DEFAULT_DESKTOP_AGENT,
        projectLocationMode: env.MD2_PROJECT_LOCATION_MODE || DEFAULT_PROJECT_LOCATION_MODE,
    }
}

module.exports = {
    DEFAULT_APP_URL,
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_PROJECT_LOCATION_MODE,
    resolveDesktopConfig,
    resolveAppUrl,
}
