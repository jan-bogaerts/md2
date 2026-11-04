import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardPopupService } from '../card_popup_service'
import { CardsKeyboardShortcutService } from './cards_keyboard_shortcut_service'

function createKeyboardEvent(key: string, modifiers: KeyboardEventInit = {}) {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, {
        altKey: { value: false },
        ctrlKey: { value: false },
        key: { value: key },
        metaKey: { value: false },
        shiftKey: { value: false },
        ...Object.fromEntries(Object.entries(modifiers).map(([name, value]) => [name, { value }])),
    });

    return event as KeyboardEvent;
}

function createService(cycleResult: boolean) {
    const cycle = vi.fn(() => cycleResult);
    const service = new CardsKeyboardShortcutService({ popups: { cycle } as unknown as CardPopupService });

    return { cycle, service };
}

describe('CardsKeyboardShortcutService', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('cycles popups forward on Ctrl+Tab and backward on Ctrl+Shift+Tab', () => {
        vi.stubGlobal('navigator', { userAgent: 'Windows', userAgentData: { platform: 'Windows' } });
        const { cycle, service } = createService(true);

        expect(service.handleKeyDown(createKeyboardEvent('Tab', { ctrlKey: true }))).toBe(true);
        expect(service.handleKeyDown(createKeyboardEvent('Tab', { ctrlKey: true, shiftKey: true }))).toBe(true);
        expect(cycle).toHaveBeenNthCalledWith(1, 1);
        expect(cycle).toHaveBeenNthCalledWith(2, -1);
    });

    it('leaves Ctrl+Tab unhandled when popups cannot cycle', () => {
        vi.stubGlobal('navigator', { userAgent: 'Windows', userAgentData: { platform: 'Windows' } });
        const { service } = createService(false);

        expect(service.handleKeyDown(createKeyboardEvent('Tab', { ctrlKey: true }))).toBe(false);
    });

    it('ignores other keys', () => {
        const { cycle, service } = createService(true);

        expect(service.handleKeyDown(createKeyboardEvent('Tab'))).toBe(false);
        expect(service.handleKeyDown(createKeyboardEvent('a', { ctrlKey: true }))).toBe(false);
        expect(cycle).not.toHaveBeenCalled();
    });
});
