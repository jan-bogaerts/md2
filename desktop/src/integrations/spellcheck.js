/**
 * Right-click spelling corrections for editable renderer content. Chromium's
 * spellchecker already underlines misspelled words; this adds the context menu
 * that lets the user pick a suggestion (or teach the dictionary a new word),
 * plus a "Spelling Languages" submenu for switching the checked languages. The
 * suggestion items only appear when the click lands on a misspelled word; the
 * language submenu appears for any editable target so it stays reachable.
 */

const SPELL_CHECKER_LANGUAGES_STORE_KEY = 'spellCheckerLanguages'

let displayNames = null
function languageLabel(code) {
    try {
        if (!displayNames) displayNames = new Intl.DisplayNames(['en'], { type: 'language' })

        return displayNames.of(code) ?? code
    } catch {
        return code
    }
}

function buildLanguageSubmenu(availableLanguages, activeLanguages, onSetLanguages) {
    const active = new Set(activeLanguages)

    // Single-select: picking a language replaces the checked set so switching to
    // another language actually re-runs the check against that language alone.
    return availableLanguages.map((code) => ({
        checked: active.has(code),
        click: () => onSetLanguages([code]),
        label: languageLabel(code),
        type: 'radio',
    }))
}

function buildSpellCheckMenuTemplate(webContents, params, options = {}) {
    const { availableLanguages = [], activeLanguages = [], onSetLanguages } = options
    const template = []

    if (params.misspelledWord) {
        for (const suggestion of params.dictionarySuggestions ?? []) {
            template.push({ label: suggestion, click: () => webContents.replaceMisspelling(suggestion) })
        }

        if (template.length > 0) template.push({ type: 'separator' })
        template.push({
            label: 'Add to Dictionary',
            click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        })
    }

    if (params.isEditable && onSetLanguages && availableLanguages.length > 0) {
        if (template.length > 0) template.push({ type: 'separator' })
        template.push({
            label: 'Spelling Languages',
            submenu: buildLanguageSubmenu(availableLanguages, activeLanguages, onSetLanguages),
        })
    }

    return template
}

function registerSpellCheckContextMenu(webContents, buildMenu, options = {}) {
    const { getAvailableLanguages, getActiveLanguages, setActiveLanguages } = options

    webContents.on('context-menu', (_event, params) => {
        const template = buildSpellCheckMenuTemplate(webContents, params, {
            activeLanguages: getActiveLanguages?.() ?? [],
            availableLanguages: getAvailableLanguages?.() ?? [],
            onSetLanguages: setActiveLanguages,
        })
        if (template.length === 0) return

        buildMenu(template).popup()
    })
}

/**
 * Chromium does not re-spellcheck text that is already rendered when the
 * language set changes; squiggles refresh only when the editable surface
 * reloads. Toggling the spellcheck attribute off and back on (with a frame in
 * between) plus a blur/focus of the active element forces a re-check without
 * remounting the editor.
 */
const REFRESH_SPELL_CHECK_SCRIPT = `(() => {
    const editables = document.querySelectorAll('[contenteditable], textarea, input')
    for (const element of editables) element.spellcheck = false
    requestAnimationFrame(() => {
        for (const element of editables) element.spellcheck = true
        const active = document.activeElement
        if (active && typeof active.blur === 'function') {
            active.blur()
            active.focus()
        }
    })
})()`

function refreshSpellCheck(webContents) {
    if (webContents.isDestroyed()) return

    webContents.executeJavaScript(REFRESH_SPELL_CHECK_SCRIPT, true).catch(() => {})
}

/** Re-apply the user's persisted language choice, ignoring any codes the platform no longer supports. */
function applyStoredSpellCheckerLanguages(session, storedLanguages) {
    if (!Array.isArray(storedLanguages)) return

    const available = new Set(session.availableSpellCheckerLanguages)
    const languages = storedLanguages.filter((code) => available.has(code))
    if (languages.length > 0) session.setSpellCheckerLanguages(languages)
}

module.exports = {
    REFRESH_SPELL_CHECK_SCRIPT,
    SPELL_CHECKER_LANGUAGES_STORE_KEY,
    applyStoredSpellCheckerLanguages,
    buildSpellCheckMenuTemplate,
    refreshSpellCheck,
    registerSpellCheckContextMenu,
}
