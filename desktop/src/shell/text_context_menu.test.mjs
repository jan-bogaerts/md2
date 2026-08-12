import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    buildEditingMenuSection,
    buildTextContextMenuTemplate,
    registerTextContextMenu,
} = require('./text_context_menu');

function createWebContents() {
    return {
        listeners: {},
        on: vi.fn(function on(event, listener) { this.listeners[event] = listener; }),
        replaceMisspelling: vi.fn(),
        session: { addWordToSpellCheckerDictionary: vi.fn() },
    };
}

function createParams(overrides = {}) {
    return {
        dictionarySuggestions: [],
        editFlags: { canCopy: false, canCut: false, canPaste: false },
        isEditable: false,
        misspelledWord: '',
        selectionText: '',
        ...overrides,
    };
}

describe('editing menu section', () => {
    it('uses native roles and Electron edit flags for editing commands', () => {
        const section = buildEditingMenuSection(createParams({
            editFlags: { canCopy: true, canCut: true, canPaste: true },
            selectionText: 'Rendered selection',
        }), { writeText: vi.fn() });

        expect(section).toMatchObject([
            { enabled: true, role: 'cut' },
            { enabled: true, role: 'copy' },
            { enabled: true, label: 'Copy as Text' },
            { enabled: true, role: 'paste' },
        ]);
    });

    it('offers copy actions but disables cut and paste for a read-only selection', () => {
        const section = buildEditingMenuSection(createParams({
            editFlags: { canCopy: true, canCut: false, canPaste: false },
            selectionText: 'Read-only text',
        }), { writeText: vi.fn() });

        expect(section).toMatchObject([
            { enabled: false, role: 'cut' },
            { enabled: true, role: 'copy' },
            { enabled: true, label: 'Copy as Text' },
            { enabled: false, role: 'paste' },
        ]);
    });

    it('disables Copy as Text without a textual selection', () => {
        const params = createParams({editFlags: { canCopy: false, canCut: false, canPaste: true }});
        const section = buildEditingMenuSection(params, { writeText: vi.fn() });

        expect(section.find((item) => item.label === 'Copy as Text')).toMatchObject({ enabled: false });
    });

    it('writes rendered selection text to the plain-text clipboard', () => {
        const clipboard = { writeText: vi.fn() };
        const section = buildEditingMenuSection(createParams({
            editFlags: { canCopy: true, canCut: false, canPaste: false },
            selectionText: 'Rendered selection',
        }), clipboard);

        section.find((item) => item.label === 'Copy as Text').click();

        expect(clipboard.writeText).toHaveBeenCalledWith('Rendered selection');
    });

    it('is empty when no editing action applies', () => {
        expect(buildEditingMenuSection(createParams(), { writeText: vi.fn() })).toEqual([]);
    });
});

describe('text context menu composition', () => {
    it('keeps corrections, editing commands, and spelling languages in separate groups', () => {
        const template = buildTextContextMenuTemplate(createWebContents(), createParams({
            dictionarySuggestions: ['the'],
            editFlags: { canCopy: true, canCut: true, canPaste: true },
            isEditable: true,
            misspelledWord: 'teh',
            selectionText: 'teh',
        }), {
            activeLanguages: ['en-US'],
            availableLanguages: ['en-US'],
            clipboard: { writeText: vi.fn() },
            onSetLanguages: vi.fn(),
        });

        expect(template.map((item) => item.label ?? item.role ?? item.type)).toEqual([
            'the',
            'Add to Dictionary',
            'separator',
            'cut',
            'copy',
            'Copy as Text',
            'paste',
            'separator',
            'Spelling Languages',
        ]);
    });

    it('does not add leading, trailing, or duplicate separators when groups are absent', () => {
        const template = buildTextContextMenuTemplate(createWebContents(), createParams({
            editFlags: { canCopy: true, canCut: false, canPaste: false },
            selectionText: 'Selection',
        }), { clipboard: { writeText: vi.fn() } });

        expect(template.map((item) => item.label ?? item.role ?? item.type)).toEqual([
            'cut',
            'copy',
            'Copy as Text',
            'paste',
        ]);
    });

    it('is empty when no spelling or editing action applies', () => {
        const template = buildTextContextMenuTemplate(
            createWebContents(),
            createParams(),
            { clipboard: { writeText: vi.fn() } },
        );

        expect(template).toEqual([]);
    });
});

describe('text context menu registration', () => {
    it('builds and opens only non-empty menus', () => {
        const webContents = createWebContents();
        const popup = vi.fn();
        const buildMenu = vi.fn(() => ({ popup }));
        registerTextContextMenu(webContents, {
            buildMenu,
            clipboard: { writeText: vi.fn() },
        });

        webContents.listeners['context-menu']({}, createParams());
        expect(buildMenu).not.toHaveBeenCalled();

        webContents.listeners['context-menu']({}, createParams({
            editFlags: { canCopy: true, canCut: false, canPaste: false },
            selectionText: 'Selection',
        }));
        expect(buildMenu).toHaveBeenCalledOnce();
        expect(popup).toHaveBeenCalledOnce();
    });
});
