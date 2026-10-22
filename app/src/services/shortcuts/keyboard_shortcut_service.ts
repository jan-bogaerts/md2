import type { WorkspaceViewMode, WorkspaceViewService } from '../project/workspace_view_service'
import { workspaceViewService } from '../project/workspace_view_service'
import { register } from '../service_injector'
import { cardsKeyboardShortcutService } from './cards_keyboard_shortcut_service'
import { diagramKeyboardShortcutService } from './diagram_keyboard_shortcut_service'
import { globalKeyboardShortcutService } from './global_keyboard_shortcut_service'
import { markdownLocalSearchKeyboardService } from './markdown_local_search_keyboard_service'
import { statsKeyboardShortcutService } from './stats_keyboard_shortcut_service'
import { textKeyboardShortcutService } from './text_keyboard_shortcut_service'

export interface KeyboardShortcutHandler {
    handleKeyDown(event: KeyboardEvent): boolean;
}

export type ViewKeyboardShortcutServices = Record<WorkspaceViewMode, KeyboardShortcutHandler>;

export interface KeyboardShortcutServiceDependencies {
    global: KeyboardShortcutHandler;
    markdownLocalSearch: KeyboardShortcutHandler;
    views: ViewKeyboardShortcutServices;
    workspaceView: WorkspaceViewService;
}

/** Owns keyboard listeners and routes keys to global behavior plus active workspace view. */
export class KeyboardShortcutService extends EventTarget {
    private activeView: KeyboardShortcutHandler;
    private capsLockActive = false;
    private readonly dependencies: KeyboardShortcutServiceDependencies;
    private listenerTarget: Window | null = null;

    constructor(dependencies: KeyboardShortcutServiceDependencies) {
        super();
        this.dependencies = dependencies;
        this.activeView = dependencies.views[dependencies.workspaceView.getSnapshot().viewMode];
    }

    readonly getCapsLockSnapshot = () => this.capsLockActive;

    readonly subscribeCapsLock = (listener: () => void) => {
        this.addEventListener('capsLockChanged', listener);

        return () => this.removeEventListener('capsLockChanged', listener);
    };

    start(listenerTarget: Window = window) {
        if (this.listenerTarget === listenerTarget) return;
        if (this.listenerTarget) this.stop();

        this.listenerTarget = listenerTarget;
        this.activeView = this.dependencies.views[this.dependencies.workspaceView.getSnapshot().viewMode];
        listenerTarget.addEventListener('keydown', this.handleKeyDown);
        listenerTarget.addEventListener('keyup', this.handleKeyUp);
        this.dependencies.workspaceView.addEventListener('changed', this.handleWorkspaceViewChanged);
    }

    stop() {
        if (!this.listenerTarget) return;

        this.listenerTarget.removeEventListener('keydown', this.handleKeyDown);
        this.listenerTarget.removeEventListener('keyup', this.handleKeyUp);
        this.dependencies.workspaceView.removeEventListener('changed', this.handleWorkspaceViewChanged);
        this.listenerTarget = null;
        this.setCapsLockActive(false);
    }

    private readonly handleKeyDown = (event: KeyboardEvent) => {
        this.updateCapsLock(event);
        const handled = this.dependencies.global.handleKeyDown(event)
            || this.activeView.handleKeyDown(event)
            || this.dependencies.markdownLocalSearch.handleKeyDown(event);
        if (handled) event.preventDefault();
    };

    private readonly handleKeyUp = (event: KeyboardEvent) => {
        this.updateCapsLock(event);
    };

    private readonly handleWorkspaceViewChanged = () => {
        const { viewMode } = this.dependencies.workspaceView.getSnapshot();
        this.activeView = this.dependencies.views[viewMode];
    };

    private updateCapsLock(event: KeyboardEvent) {
        this.setCapsLockActive(event.getModifierState('CapsLock'));
    }

    private setCapsLockActive(nextCapsLockActive: boolean) {
        if (nextCapsLockActive === this.capsLockActive) return;

        this.capsLockActive = nextCapsLockActive;
        this.dispatchEvent(new Event('capsLockChanged'));
    }
}

const viewServices: ViewKeyboardShortcutServices = {
    cards: cardsKeyboardShortcutService,
    diagrams: diagramKeyboardShortcutService,
    stats: statsKeyboardShortcutService,
    text: textKeyboardShortcutService,
};

export const keyboardShortcutService = register('keyboardShortcutService', new KeyboardShortcutService({
    global: globalKeyboardShortcutService,
    markdownLocalSearch: markdownLocalSearchKeyboardService,
    views: viewServices,
    workspaceView: workspaceViewService,
}));
