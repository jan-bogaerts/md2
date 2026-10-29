import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramEditSessionSnapshot, DiagramPersistentTool } from '../diagrams/diagram_edit_types'
import {
    DIAGRAM_EDITOR_ROOT_ATTRIBUTE,
    DIAGRAM_ESCAPE_REQUESTED_EVENT,
    DiagramKeyboardShortcutService,
} from './diagram_keyboard_shortcut_service'

function createKeyboardEvent(key: string, modifiers: KeyboardEventInit = {}) {
    return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...modifiers });
}

function createSessionStub(activeTool: DiagramPersistentTool, hasSession = true) {
    const editSession: DiagramEditSessionSnapshot | null = hasSession ? { sourceDiagramId: 'diagram' } : null;
    const read = { getActiveToolSnapshot: () => activeTool, getSessionSnapshot: () => editSession };

    return { read, setActiveTool: vi.fn() };
}

function createService(activeTool: DiagramPersistentTool = 'select', hasSession = true) {
    const session = createSessionStub(activeTool, hasSession);
    const service = new DiagramKeyboardShortcutService({ deleteSelection: () => false }, session);
    const escapeRequested = vi.fn();
    service.addEventListener(DIAGRAM_ESCAPE_REQUESTED_EVENT, escapeRequested);

    return { escapeRequested, service, session };
}

describe('DiagramKeyboardShortcutService', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('deletes selection for unmodified Delete owned by diagram editor', () => {
        const deleteSelection = vi.fn(() => true);
        const service = new DiagramKeyboardShortcutService({ deleteSelection }, createSessionStub('select'));
        const editor = document.createElement('div');
        editor.setAttribute(DIAGRAM_EDITOR_ROOT_ATTRIBUTE, '');
        editor.tabIndex = -1;
        document.body.append(editor);
        editor.focus();

        expect(service.handleKeyDown(createKeyboardEvent('Delete'))).toBe(true);
        expect(deleteSelection).toHaveBeenCalledOnce();
    });

    it('deletes selection when focus remains on a button outside the diagram editor', () => {
        const deleteSelection = vi.fn(() => true);
        const service = new DiagramKeyboardShortcutService({ deleteSelection }, createSessionStub('select'));
        const toolboxButton = document.createElement('button');
        document.body.append(toolboxButton);
        toolboxButton.focus();

        expect(service.handleKeyDown(createKeyboardEvent('Delete'))).toBe(true);
        expect(deleteSelection).toHaveBeenCalledOnce();
    });

    it('leaves Delete to text fields, dialogs, menus, and modified keys', () => {
        const deleteSelection = vi.fn(() => true);
        const service = new DiagramKeyboardShortcutService({ deleteSelection }, createSessionStub('select'));
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
        const service = new DiagramKeyboardShortcutService({ deleteSelection: () => false }, createSessionStub('select'));

        expect(service.handleKeyDown(createKeyboardEvent('Delete'))).toBe(false);
    });

    it('routes Escape to diagram subscribers and reports whether one handled it', () => {
        const service = new DiagramKeyboardShortcutService({ deleteSelection: () => false }, createSessionStub('select'));
        service.addEventListener(DIAGRAM_ESCAPE_REQUESTED_EVENT, (event) => event.preventDefault());

        expect(service.handleKeyDown(createKeyboardEvent('Escape'))).toBe(true);
        expect(service.handleKeyDown(createKeyboardEvent('Enter'))).toBe(false);
    });

    it.each<DiagramPersistentTool>(['node:component', 'edge:connection', 'group'])('switches the %s Add tool to Select on Escape without requesting viewport cancels', (activeTool) => {
        const { escapeRequested, service, session } = createService(activeTool);

        expect(service.handleKeyDown(createKeyboardEvent('Escape'))).toBe(true);
        expect(session.setActiveTool).toHaveBeenCalledExactlyOnceWith('select');
        expect(escapeRequested).not.toHaveBeenCalled();
    });

    it.each<DiagramPersistentTool>(['select', 'pan'])('requests viewport cancels on Escape with the %s tool', (activeTool) => {
        const { escapeRequested, service, session } = createService(activeTool);

        service.handleKeyDown(createKeyboardEvent('Escape'));

        expect(escapeRequested).toHaveBeenCalledOnce();
        expect(session.setActiveTool).not.toHaveBeenCalled();
    });

    it.each(['input', 'dialog'])('keeps the Add tool when Escape comes from an %s', (owner) => {
        const { service, session } = createService('node:component');
        const container = document.createElement('div');
        if (owner === 'dialog') container.setAttribute('role', 'dialog');
        const target = owner === 'input' ? document.createElement('input') : document.createElement('button');
        container.append(target);
        document.body.append(container);
        const event = createKeyboardEvent('Escape');

        target.dispatchEvent(event);
        service.handleKeyDown(event);

        expect(session.setActiveTool).not.toHaveBeenCalled();
    });

    it('keeps the tool on Escape without an edit session', () => {
        const { escapeRequested, service, session } = createService('node:component', false);

        service.handleKeyDown(createKeyboardEvent('Escape'));

        expect(session.setActiveTool).not.toHaveBeenCalled();
        expect(escapeRequested).toHaveBeenCalledOnce();
    });
});
