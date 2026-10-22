import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    DIAGRAM_EDITOR_ROOT_ATTRIBUTE,
    DIAGRAM_ESCAPE_REQUESTED_EVENT,
    DiagramKeyboardShortcutService,
} from './diagram_keyboard_shortcut_service'

function createKeyboardEvent(key: string, modifiers: KeyboardEventInit = {}) {
    return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...modifiers });
}

describe('DiagramKeyboardShortcutService', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('deletes selection for unmodified Delete owned by diagram editor', () => {
        const deleteSelection = vi.fn(() => true);
        const service = new DiagramKeyboardShortcutService({ deleteSelection });
        const editor = document.createElement('div');
        editor.setAttribute(DIAGRAM_EDITOR_ROOT_ATTRIBUTE, '');
        editor.tabIndex = -1;
        document.body.append(editor);
        editor.focus();

        expect(service.handleKeyDown(createKeyboardEvent('Delete'))).toBe(true);
        expect(deleteSelection).toHaveBeenCalledOnce();
    });

    it('leaves Delete to text fields, dialogs, menus, and modified keys', () => {
        const deleteSelection = vi.fn(() => true);
        const service = new DiagramKeyboardShortcutService({ deleteSelection });
        const input = document.createElement('input');
        document.body.append(input);
        input.focus();
        const events = [
            createKeyboardEvent('Delete'),
            createKeyboardEvent('Delete', { altKey: true }),
            createKeyboardEvent('Delete', { ctrlKey: true }),
            createKeyboardEvent('Delete', { metaKey: true }),
        ];

        expect(events.some((event) => service.handleKeyDown(event))).toBe(false);
        expect(deleteSelection).not.toHaveBeenCalled();
    });

    it('reports Delete unhandled when selection service changes nothing', () => {
        const service = new DiagramKeyboardShortcutService({ deleteSelection: () => false });

        expect(service.handleKeyDown(createKeyboardEvent('Delete'))).toBe(false);
    });

    it('routes Escape to diagram subscribers and reports whether one handled it', () => {
        const service = new DiagramKeyboardShortcutService({ deleteSelection: () => false });
        service.addEventListener(DIAGRAM_ESCAPE_REQUESTED_EVENT, (event) => event.preventDefault());

        expect(service.handleKeyDown(createKeyboardEvent('Escape'))).toBe(true);
        expect(service.handleKeyDown(createKeyboardEvent('Enter'))).toBe(false);
    });
});
