import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceViewMode, WorkspaceViewService } from '../project/workspace_view_service'
import {
    KeyboardShortcutService,
    type KeyboardShortcutHandler,
    type ViewKeyboardShortcutServices,
} from './keyboard_shortcut_service'

class WorkspaceViewStub extends EventTarget {
    private viewMode: WorkspaceViewMode = 'cards';

    getSnapshot() {
        return { selectedPath: null, viewMode: this.viewMode };
    }

    setViewMode(viewMode: WorkspaceViewMode) {
        this.viewMode = viewMode;
        this.dispatchEvent(new Event('changed'));
    }
}

function createHandler(result = false): KeyboardShortcutHandler & { handleKeyDown: ReturnType<typeof vi.fn> } {
    return { handleKeyDown: vi.fn(() => result) };
}

function createKeyboardEvent(type = 'keydown', capsLock = false) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
        altKey: { value: false },
        ctrlKey: { value: false },
        getModifierState: { value: (modifier: string) => modifier === 'CapsLock' && capsLock },
        key: { value: 'x' },
        metaKey: { value: false },
        shiftKey: { value: false },
    });

    return event as KeyboardEvent;
}

function createService() {
    const workspaceView = new WorkspaceViewStub();
    const global = createHandler();
    const markdownLocalSearch = createHandler();
    const views: ViewKeyboardShortcutServices = {
        cards: createHandler(),
        diagrams: createHandler(),
        stats: createHandler(),
        text: createHandler(),
    };
    const service = new KeyboardShortcutService({
        global,
        markdownLocalSearch,
        views,
        workspaceView: workspaceView as unknown as WorkspaceViewService,
    });

    return { global, markdownLocalSearch, service, views, workspaceView };
}

describe('KeyboardShortcutService', () => {
    afterEach(() => vi.restoreAllMocks());

    it('owns one keydown and keyup listener while started', () => {
        const target = new EventTarget();
        const addEventListener = vi.spyOn(target, 'addEventListener');
        const removeEventListener = vi.spyOn(target, 'removeEventListener');
        const { service } = createService();

        service.start(target as unknown as Window);
        service.start(target as unknown as Window);
        service.stop();

        expect(addEventListener).toHaveBeenCalledTimes(2);
        expect(removeEventListener).toHaveBeenCalledTimes(2);
    });

    it('routes an unhandled key only to active view and Markdown local search', () => {
        const target = new EventTarget();
        const { global, markdownLocalSearch, service, views } = createService();
        service.start(target as unknown as Window);

        target.dispatchEvent(createKeyboardEvent());

        expect(global.handleKeyDown).toHaveBeenCalledOnce();
        expect(views.cards.handleKeyDown).toHaveBeenCalledOnce();
        expect(views.text.handleKeyDown).not.toHaveBeenCalled();
        expect(markdownLocalSearch.handleKeyDown).toHaveBeenCalledOnce();
    });

    it('switches active subservice when workspace view changes', () => {
        const target = new EventTarget();
        const { service, views, workspaceView } = createService();
        service.start(target as unknown as Window);
        workspaceView.setViewMode('diagrams');

        target.dispatchEvent(createKeyboardEvent());

        expect(views.cards.handleKeyDown).not.toHaveBeenCalled();
        expect(views.diagrams.handleKeyDown).toHaveBeenCalledOnce();
    });

    it('stops routing after service stops', () => {
        const target = new EventTarget();
        const { global, service } = createService();
        service.start(target as unknown as Window);
        service.stop();

        target.dispatchEvent(createKeyboardEvent());

        expect(global.handleKeyDown).not.toHaveBeenCalled();
    });

    it('prevents browser action when handler owns key', () => {
        const target = new EventTarget();
        const { service, views } = createService();
        vi.mocked(views.cards.handleKeyDown).mockReturnValue(true);
        service.start(target as unknown as Window);
        const event = createKeyboardEvent();

        target.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it('publishes Caps Lock changes from keydown and keyup', () => {
        const target = new EventTarget();
        const { service } = createService();
        const listener = vi.fn();
        service.subscribeCapsLock(listener);
        service.start(target as unknown as Window);

        target.dispatchEvent(createKeyboardEvent('keydown', true));
        target.dispatchEvent(createKeyboardEvent('keyup', false));

        expect(listener).toHaveBeenCalledTimes(2);
        expect(service.getCapsLockSnapshot()).toBe(false);
    });
});
