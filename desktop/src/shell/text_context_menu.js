const { CLIPBOARD_COPY_AS_TEXT_CHANNEL } = require('./ipc_channels');
const { buildSpellCheckMenuSections } = require('../integrations/spellcheck');

function composeMenuSections(sections) {
    const populatedSections = sections.filter((section) => section.length > 0);
    const template = [];

    for (const section of populatedSections) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push(...section);
    }

    return template;
}

/**
 * Build native editing commands for the clicked renderer text context.
 *
 * `Copy as Text` asks the renderer to do the copying rather than writing the
 * clipboard here, so the menu and the Ctrl+Shift+C shortcut produce identical
 * content. `registerAccelerator: false` draws the shortcut hint without binding
 * the keystroke at menu level, which would otherwise copy twice for one press.
 */
function buildEditingMenuSection(webContents, params) {
    const { canCopy = false, canCut = false, canPaste = false } = params.editFlags ?? {};
    const canCopyAsText = !!params.selectionText;
    if (!canCopy && !canCopyAsText && !canCut && !canPaste) return [];

    return [
        { enabled: canCut, role: 'cut' },
        { enabled: canCopy, role: 'copy' },
        {
            accelerator: 'CommandOrControl+Shift+C',
            click: () => webContents.send(CLIPBOARD_COPY_AS_TEXT_CHANNEL),
            enabled: canCopyAsText,
            label: 'Copy as Text',
            registerAccelerator: false,
        },
        { enabled: canPaste, role: 'paste' },
    ];
}

function buildTextContextMenuTemplate(webContents, params, options) {
    const {
        activeLanguages = [],
        availableLanguages = [],
        onSetLanguages,
    } = options;
    const { correctionItems, languageItems } = buildSpellCheckMenuSections(webContents, params, {
        activeLanguages,
        availableLanguages,
        onSetLanguages,
    });
    const editingItems = buildEditingMenuSection(webContents, params);

    return composeMenuSections([correctionItems, editingItems, languageItems]);
}

/** Register one owner for Electron text editing and spelling context menus. */
function registerTextContextMenu(webContents, options) {
    const {
        buildMenu,
        getActiveLanguages,
        getAvailableLanguages,
        setActiveLanguages,
    } = options;
    if (typeof buildMenu !== 'function') throw new Error('Menu builder dependency is required for the text context menu');

    webContents.on('context-menu', (_event, params) => {
        const template = buildTextContextMenuTemplate(webContents, params, {
            activeLanguages: getActiveLanguages?.() ?? [],
            availableLanguages: getAvailableLanguages?.() ?? [],
            onSetLanguages: setActiveLanguages,
        });
        if (template.length === 0) return;

        buildMenu(template).popup();
    });
}

module.exports = {
    buildEditingMenuSection,
    buildTextContextMenuTemplate,
    registerTextContextMenu,
};
