import { cardPopupService, type CardPopupService } from '../card_popup_service'
import type { KeyboardShortcutHandler } from './keyboard_shortcut_service'
import { NEXT_LIST_TAB_SHORTCUT, PREVIOUS_LIST_TAB_SHORTCUT } from './list_tab_shortcuts'
import { matchesKeyboardShortcut } from './matches_keyboard_shortcut'

export interface CardsKeyboardShortcutServiceDependencies {
    popups: CardPopupService;
}

/** Handles shortcuts that belong only to cards workspace view. */
export class CardsKeyboardShortcutService implements KeyboardShortcutHandler {
    private readonly dependencies: CardsKeyboardShortcutServiceDependencies;

    constructor(dependencies: CardsKeyboardShortcutServiceDependencies) {
        this.dependencies = dependencies;
    }

    handleKeyDown(event: KeyboardEvent) {
        if (matchesKeyboardShortcut(event, NEXT_LIST_TAB_SHORTCUT)) return this.dependencies.popups.cycle(1);
        if (matchesKeyboardShortcut(event, PREVIOUS_LIST_TAB_SHORTCUT)) return this.dependencies.popups.cycle(-1);

        return false;
    }
}

export const cardsKeyboardShortcutService = new CardsKeyboardShortcutService({ popups: cardPopupService });
