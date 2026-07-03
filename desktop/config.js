const DEFAULT_APP_URL = 'http://localhost:5173'

function resolveAppUrl(env = process.env) {
    return env.MD2_APP_URL || DEFAULT_APP_URL
}

module.exports = {
    DEFAULT_APP_URL,
    resolveAppUrl,
}
