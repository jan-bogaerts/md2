import type { DataService } from '../data/data_service'
import { dataService } from '../data/data_service'
import type { ProjectAccessService } from '../project/project_access_service'
import { projectAccessService } from '../project/project_access_service'
import type { ProjectPersistenceService } from '../project/project_persistence_service'
import { projectPersistenceService } from '../project/project_persistence_service'
import type { ProjectSessionService } from '../project/project_session_service'
import { projectSessionService } from '../project/project_session_service'
import { GLOBAL_SEARCH_SHORTCUT, type SearchOpenService } from '../search/search_open_service'
import { searchOpenService } from '../search/search_open_service'
import type { KeyboardShortcutHandler } from './keyboard_shortcut_service'
import { matchesKeyboardShortcut } from './matches_keyboard_shortcut'

export interface GlobalKeyboardShortcutServiceDependencies {
    data: DataService;
    persistence: ProjectPersistenceService;
    projectAccess: ProjectAccessService;
    projectSession: ProjectSessionService;
    searchOpen: SearchOpenService;
}

const COMMIT_SHORTCUT = { alt: false, ctrl: false, key: 's', mod: true, shift: false };

/** Handles application-wide shortcuts independent of workspace view. */
export class GlobalKeyboardShortcutService implements KeyboardShortcutHandler {
    private readonly dependencies: GlobalKeyboardShortcutServiceDependencies;

    constructor(dependencies: GlobalKeyboardShortcutServiceDependencies) {
        this.dependencies = dependencies;
    }

    handleKeyDown(event: KeyboardEvent) {
        if (matchesKeyboardShortcut(event, COMMIT_SHORTCUT)) {
            if (this.canCommit()) void this.dependencies.projectSession.commit().catch(() => undefined);

            return true;
        }
        if (!matchesKeyboardShortcut(event, GLOBAL_SEARCH_SHORTCUT)) return false;

        this.dependencies.searchOpen.requestOpen();

        return true;
    }

    private canCommit() {
        return !!this.dependencies.data.getState().project
            && this.dependencies.persistence.getSnapshot().hasPendingSave
            && !this.dependencies.projectAccess.getSnapshot()
            && !this.dependencies.projectSession.getSnapshot().isLoading;
    }
}

export const globalKeyboardShortcutService = new GlobalKeyboardShortcutService({
    data: dataService,
    persistence: projectPersistenceService,
    projectAccess: projectAccessService,
    projectSession: projectSessionService,
    searchOpen: searchOpenService,
});
