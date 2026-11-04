import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataService } from '../data/data_service'
import type { ProjectAccessService } from '../project/project_access_service'
import type { ProjectPersistenceService } from '../project/project_persistence_service'
import type { ProjectSessionService } from '../project/project_session_service'
import type { SearchOpenService } from '../search/search_open_service'
import { GlobalKeyboardShortcutService } from './global_keyboard_shortcut_service'

function setPlatform(platform: string) {
    vi.stubGlobal('navigator', { userAgent: platform, userAgentData: { platform } });
}

function createKeyboardEvent(key: string, modifiers: KeyboardEventInit = {}) {
    return { altKey: false, ctrlKey: false, key, metaKey: false, shiftKey: false, ...modifiers } as KeyboardEvent;
}

function createService() {
    const state: {
        hasPendingSave: boolean;
        isLoading: boolean;
        project: { branch: string; id: string } | null;
        readOnly: boolean;
    } = {
        hasPendingSave: true,
        isLoading: false,
        project: { branch: 'main', id: 'project' },
        readOnly: false,
    };
    const commit = vi.fn(async () => undefined);
    const requestOpen = vi.fn();
    const service = new GlobalKeyboardShortcutService({
        data: { getState: () => ({ project: state.project }) } as unknown as DataService,
        persistence: { getSnapshot: () => ({ hasPendingSave: state.hasPendingSave }) } as unknown as ProjectPersistenceService,
        projectAccess: { getSnapshot: () => state.readOnly } as ProjectAccessService,
        projectSession: { commit, getSnapshot: () => ({ isLoading: state.isLoading }) } as unknown as ProjectSessionService,
        searchOpen: { requestOpen } as unknown as SearchOpenService,
    });

    return { commit, requestOpen, service, state };
}

describe('GlobalKeyboardShortcutService', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('commits pending writable project changes from exact Ctrl+S', () => {
        setPlatform('Windows');
        const { commit, service } = createService();

        expect(service.handleKeyDown(createKeyboardEvent('s', { ctrlKey: true }))).toBe(true);
        expect(commit).toHaveBeenCalledOnce();
    });

    it('owns Ctrl+S without committing while Commit is unavailable', () => {
        setPlatform('Windows');
        const unavailableStates: Array<(state: ReturnType<typeof createService>['state']) => void> = [
            (state) => { state.project = null; },
            (state) => { state.hasPendingSave = false; },
            (state) => { state.readOnly = true; },
            (state) => { state.isLoading = true; },
        ];

        for (const setUnavailable of unavailableStates) {
            const { commit, service, state } = createService();
            setUnavailable(state);
            expect(service.handleKeyDown(createKeyboardEvent('s', { ctrlKey: true }))).toBe(true);
            expect(commit).not.toHaveBeenCalled();
        }
    });

    it('requests global search from exact Ctrl+Shift+F', () => {
        setPlatform('Windows');
        const { requestOpen, service } = createService();

        expect(service.handleKeyDown(createKeyboardEvent('f', { ctrlKey: true, shiftKey: true }))).toBe(true);
        expect(service.handleKeyDown(createKeyboardEvent('f', { ctrlKey: true }))).toBe(false);
        expect(requestOpen).toHaveBeenCalledOnce();
    });
});
