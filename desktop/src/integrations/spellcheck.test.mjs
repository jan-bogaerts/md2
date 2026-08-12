import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    REFRESH_SPELL_CHECK_SCRIPT,
    applyStoredSpellCheckerLanguages,
    buildSpellCheckMenuSections,
    refreshSpellCheck,
} = require('./spellcheck');

function createWebContents() {
    return {
        listeners: {},
        on: vi.fn(function on(event, listener) { this.listeners[event] = listener; }),
        replaceMisspelling: vi.fn(),
        session: { addWordToSpellCheckerDictionary: vi.fn() },
    };
}

describe('spell check menu template', () => {
    it('is empty when the click is not on a misspelled word', () => {
        expect(buildSpellCheckMenuSections(createWebContents(), { misspelledWord: '', dictionarySuggestions: [] })).toEqual({
            correctionItems: [],
            languageItems: [],
        });
    });

    it('offers suggestions that replace the misspelling and an add-to-dictionary action', () => {
        const webContents = createWebContents();
        const { correctionItems } = buildSpellCheckMenuSections(webContents, {
            misspelledWord: 'teh',
            dictionarySuggestions: ['the', 'tech'],
        });

        expect(correctionItems.map((item) => item.label)).toEqual(['the', 'tech', 'Add to Dictionary']);

        correctionItems[0].click();
        expect(webContents.replaceMisspelling).toHaveBeenCalledWith('the');

        correctionItems[2].click();
        expect(webContents.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('teh');
    });

    it('offers add-to-dictionary when there are no suggestions', () => {
        const { correctionItems } = buildSpellCheckMenuSections(createWebContents(), {
            misspelledWord: 'zzz',
            dictionarySuggestions: [],
        }, {});

        expect(correctionItems.map((item) => item.label)).toEqual(['Add to Dictionary']);
    });
});

describe('spelling languages submenu', () => {
    const languageOptions = {
        activeLanguages: ['en-US'],
        availableLanguages: ['en-US', 'fr'],
        onSetLanguages: vi.fn(),
    };

    it('appears for any editable target, even without a misspelled word', () => {
        const { languageItems } = buildSpellCheckMenuSections(
            createWebContents(),
            { misspelledWord: '', isEditable: true },
            languageOptions,
        );
        const languages = languageItems[0];

        expect(languages.submenu.map((item) => ({ checked: item.checked, label: item.label }))).toEqual([
            { checked: true, label: 'American English' },
            { checked: false, label: 'French' },
        ]);
    });

    it('is omitted for non-editable targets', () => {
        const { languageItems } = buildSpellCheckMenuSections(
            createWebContents(),
            { misspelledWord: '', isEditable: false },
            languageOptions,
        );

        expect(languageItems).toEqual([]);
    });

    it('replaces the checked language rather than adding to it', () => {
        const onSetLanguages = vi.fn();
        const { languageItems } = buildSpellCheckMenuSections(createWebContents(), { isEditable: true }, {
            activeLanguages: ['en-US'],
            availableLanguages: ['en-US', 'fr'],
            onSetLanguages,
        });
        const submenu = languageItems[0].submenu;

        expect(submenu.every((item) => item.type === 'radio')).toBe(true);

        submenu[1].click();
        expect(onSetLanguages).toHaveBeenCalledWith(['fr']);
    });
});

describe('refreshing the spell check after a language switch', () => {
    it('re-runs the check by toggling spellcheck on editable elements', () => {
        const webContents = {
            executeJavaScript: vi.fn(async () => undefined),
            isDestroyed: () => false,
        };

        refreshSpellCheck(webContents);

        expect(webContents.executeJavaScript).toHaveBeenCalledWith(REFRESH_SPELL_CHECK_SCRIPT, true);
    });

    it('skips destroyed web contents', () => {
        const webContents = {
            executeJavaScript: vi.fn(async () => undefined),
            isDestroyed: () => true,
        };

        refreshSpellCheck(webContents);

        expect(webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('swallows script failures so a language switch never throws', async () => {
        const webContents = {
            executeJavaScript: vi.fn(async () => { throw new Error('render frame gone'); }),
            isDestroyed: () => false,
        };

        expect(() => refreshSpellCheck(webContents)).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
});

describe('applying stored spell checker languages', () => {
    function createSession(available) {
        return { availableSpellCheckerLanguages: available, setSpellCheckerLanguages: vi.fn() };
    }

    it('re-applies stored languages that the platform still supports', () => {
        const session = createSession(['en-US', 'fr', 'de']);
        applyStoredSpellCheckerLanguages(session, ['fr', 'xx-YY', 'de']);

        expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith(['fr', 'de']);
    });

    it('does nothing without a stored array or supported languages', () => {
        const session = createSession(['en-US']);
        applyStoredSpellCheckerLanguages(session, undefined);
        applyStoredSpellCheckerLanguages(session, ['xx-YY']);

        expect(session.setSpellCheckerLanguages).not.toHaveBeenCalled();
    });
});
