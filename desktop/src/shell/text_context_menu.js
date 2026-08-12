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

/** Build native editing commands for the clicked renderer text context. */
function buildEditingMenuSection(params, clipboard) {
    if (!clipboard) throw new Error('Clipboard dependency is required for the text context menu');

    const { canCopy = false, canCut = false, canPaste = false } = params.editFlags ?? {};
    const canCopyAsText = !!params.selectionText;
    if (!canCopy && !canCopyAsText && !canCut && !canPaste) return [];

    return [
        { enabled: canCut, role: 'cut' },
        { enabled: canCopy, role: 'copy' },
        {
            click: () => clipboard.writeText(params.selectionText),
            enabled: canCopyAsText,
            label: 'Copy as Text',
        },
        { enabled: canPaste, role: 'paste' },
    ];
}

function buildTextContextMenuTemplate(webContents, params, options) {
    const {
        activeLanguages = [],
        availableLanguages = [],
        clipboard,
        onSetLanguages,
    } = options;
    const { correctionItems, languageItems } = buildSpellCheckMenuSections(webContents, params, {
        activeLanguages,
        availableLanguages,
        onSetLanguages,
    });
    const editingItems = buildEditingMenuSection(params, clipboard);

    return composeMenuSections([correctionItems, editingItems, languageItems]);
}

/** Register one owner for Electron text editing and spelling context menus. */
function registerTextContextMenu(webContents, options) {
    const {
        buildMenu,
        clipboard,
        getActiveLanguages,
        getAvailableLanguages,
        setActiveLanguages,
    } = options;
    if (typeof buildMenu !== 'function') throw new Error('Menu builder dependency is required for the text context menu');

    webContents.on('context-menu', (_event, params) => {
        const template = buildTextContextMenuTemplate(webContents, params, {
            activeLanguages: getActiveLanguages?.() ?? [],
            availableLanguages: getAvailableLanguages?.() ?? [],
            clipboard,
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
