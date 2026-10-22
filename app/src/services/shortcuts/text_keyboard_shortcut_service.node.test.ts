import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListCardCommitDiffDataSource } from '../../components/card_view/list_card_commit_diff_data_source'
import type { OpenFilesService } from '../open_files_service'
import type { TelemetryService } from '../telemetry/telemetry_service'
import { TextKeyboardShortcutService } from './text_keyboard_shortcut_service'

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

function createService(selection: object | null = null) {
    const clear = vi.fn();
    const activateAdjacentDocument = vi.fn();
    const trackEvent = vi.fn();
    const service = new TextKeyboardShortcutService({
        commitDiff: { clear, getSnapshot: () => selection } as unknown as ListCardCommitDiffDataSource,
        openFiles: { activateAdjacentDocument } as unknown as OpenFilesService,
        telemetry: { trackEvent } as unknown as TelemetryService,
    });

    return { activateAdjacentDocument, clear, service, trackEvent };
}

describe('TextKeyboardShortcutService', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('moves to next and previous document with exact Ctrl+Tab shortcuts', () => {
        vi.stubGlobal('navigator', { userAgent: 'Windows', userAgentData: { platform: 'Windows' } });
        const { activateAdjacentDocument, service, trackEvent } = createService();

        expect(service.handleKeyDown(createKeyboardEvent('Tab', { ctrlKey: true }))).toBe(true);
        expect(service.handleKeyDown(createKeyboardEvent('Tab', { ctrlKey: true, shiftKey: true }))).toBe(true);
        expect(activateAdjacentDocument).toHaveBeenNthCalledWith(1, 1);
        expect(activateAdjacentDocument).toHaveBeenNthCalledWith(2, -1);
        expect(trackEvent).toHaveBeenCalledTimes(2);
    });

    it('clears selected commit diff first on Escape', () => {
        const { clear, service } = createService({ commit: 'abc' });
        const event = createKeyboardEvent('Escape');
        const stopPropagation = vi.spyOn(event, 'stopPropagation');

        expect(service.handleKeyDown(event)).toBe(true);
        expect(clear).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
    });
});
