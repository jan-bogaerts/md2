import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KeyboardShortcut } from './keyboard_platform'
import { matchesKeyboardShortcut } from './matches_keyboard_shortcut'

function setPlatform(platform: string) {
    vi.stubGlobal('navigator', { userAgent: platform, userAgentData: { platform } });
}

function createKeyboardEvent(key: string, modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}) {
    return { altKey: false, ctrlKey: false, key, metaKey: false, shiftKey: false, ...modifiers } as KeyboardEvent;
}

const shortcut: KeyboardShortcut = { alt: false, ctrl: false, key: 'f', mod: true, shift: true };

describe('matchesKeyboardShortcut', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('maps mod to Ctrl on Windows and compares keys case-insensitively', () => {
        setPlatform('Windows');

        expect(matchesKeyboardShortcut(createKeyboardEvent('F', { ctrlKey: true, shiftKey: true }), shortcut)).toBe(true);
    });

    it('maps mod to Meta on Apple platforms', () => {
        setPlatform('macOS');

        expect(matchesKeyboardShortcut(createKeyboardEvent('f', { ctrlKey: true, shiftKey: true }), shortcut)).toBe(false);
        expect(matchesKeyboardShortcut(createKeyboardEvent('f', { metaKey: true, shiftKey: true }), shortcut)).toBe(true);
    });

    it('requires exact modifiers', () => {
        setPlatform('Windows');
        const events = [
            createKeyboardEvent('f', { ctrlKey: true }),
            createKeyboardEvent('f', { altKey: true, ctrlKey: true, shiftKey: true }),
            createKeyboardEvent('f', { ctrlKey: true, metaKey: true, shiftKey: true }),
        ];

        expect(events.every((event) => !matchesKeyboardShortcut(event, shortcut))).toBe(true);
    });
});
