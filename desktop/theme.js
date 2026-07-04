const THEME_MODE_STORE_KEY = 'themeMode'
const DEFAULT_THEME_MODE = 'light'

const DARK_TITLE_BAR_OVERLAY = {
    color: '#212121',
    symbolColor: '#e9e9e9',
    height: 40,
}
const LIGHT_TITLE_BAR_OVERLAY = {
    color: '#fafafa',
    symbolColor: '#212121',
    height: 40,
}

function isThemeMode(value) {
    return value === 'light' || value === 'dark'
}

/** Validate a stored/incoming theme mode, falling back to the default. */
function resolveThemeMode(value) {
    return isThemeMode(value) ? value : DEFAULT_THEME_MODE
}

/** Native window control (min/max/close) colors matching the given theme mode. */
function resolveTitleBarOverlay(mode) {
    return resolveThemeMode(mode) === 'dark' ? DARK_TITLE_BAR_OVERLAY : LIGHT_TITLE_BAR_OVERLAY
}

module.exports = {
    DARK_TITLE_BAR_OVERLAY,
    DEFAULT_THEME_MODE,
    LIGHT_TITLE_BAR_OVERLAY,
    THEME_MODE_STORE_KEY,
    isThemeMode,
    resolveThemeMode,
    resolveTitleBarOverlay,
}
