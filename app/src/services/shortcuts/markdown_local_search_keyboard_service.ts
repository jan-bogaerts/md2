import type { KeyboardShortcutHandler } from './keyboard_shortcut_service'

export const MARKDOWN_LOCAL_SEARCH_ESCAPE_REQUESTED_EVENT = 'markdownLocalSearchEscapeRequested';

/** Routes Escape to any open Markdown-local search without knowing editor instances. */
export class MarkdownLocalSearchKeyboardService extends EventTarget implements KeyboardShortcutHandler {
    handleKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return false;

        return !this.dispatchEvent(new Event(MARKDOWN_LOCAL_SEARCH_ESCAPE_REQUESTED_EVENT, { cancelable: true }));
    }
}

export const markdownLocalSearchKeyboardService = new MarkdownLocalSearchKeyboardService();
