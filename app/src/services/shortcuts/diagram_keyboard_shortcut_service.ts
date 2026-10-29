import { diagramEditSessionService, type DiagramEditSessionAccess } from '../diagrams/diagram_edit_session_service'
import { diagramSelectionService, type DiagramSelectionService } from '../diagrams/diagram_selection_service'
import type { KeyboardShortcutHandler } from './keyboard_shortcut_service'

export const DIAGRAM_EDITOR_ROOT_ATTRIBUTE = 'data-diagram-editor';
export const DIAGRAM_ESCAPE_REQUESTED_EVENT = 'diagramEscapeRequested';

const DIAGRAM_EDITOR_ROOT_SELECTOR = `[${DIAGRAM_EDITOR_ROOT_ATTRIBUTE}]`;
const DELETE_KEY_OWNER_SELECTOR = [
    'input', 'textarea', 'select',
    '[contenteditable=""]', '[contenteditable="true"]',
    '[role="dialog"]', '[role="menu"]', '[role="menuitem"]', '[role="listbox"]', '[role="combobox"]', '[role="textbox"]',
].join(', ');
const ESCAPE_KEY_OWNER_SELECTOR = 'input, textarea, [contenteditable="true"], [role="dialog"]';

type DiagramKeyboardSessionAccess = DiagramEditSessionAccess<'getActiveToolSnapshot' | 'getSessionSnapshot', 'setActiveTool'>;

export interface DiagramEscapeRequestedDetail {
    keyboardEvent: KeyboardEvent;
}

function deleteKeyBelongsToDiagramEditor(activeElement: Element | null) {
    if (!activeElement || activeElement === activeElement.ownerDocument.body) return true;
    if (activeElement.closest(DELETE_KEY_OWNER_SELECTOR)) return false;

    return !!activeElement.closest(DIAGRAM_EDITOR_ROOT_SELECTOR);
}

/** Handles diagram keys and asks mounted viewports to cancel their local gestures. */
export class DiagramKeyboardShortcutService extends EventTarget implements KeyboardShortcutHandler {
    private readonly selection: Pick<DiagramSelectionService, 'deleteSelection'>;
    private readonly session: DiagramKeyboardSessionAccess;

    constructor(selection: Pick<DiagramSelectionService, 'deleteSelection'>, session: DiagramKeyboardSessionAccess) {
        super();
        this.selection = selection;
        this.session = session;
    }

    handleKeyDown(event: KeyboardEvent) {
        if (event.defaultPrevented) return false;
        if (event.key === 'Delete') return this.deleteSelection(event);
        if (event.key !== 'Escape') return false;
        if (this.exitAddTool(event)) return true;

        const request = new CustomEvent<DiagramEscapeRequestedDetail>(DIAGRAM_ESCAPE_REQUESTED_EVENT, {
            cancelable: true,
            detail: { keyboardEvent: event },
        });

        return !this.dispatchEvent(request);
    }

    private deleteSelection(event: KeyboardEvent) {
        if (event.altKey || event.ctrlKey || event.metaKey) return false;
        if (!deleteKeyBelongsToDiagramEditor(document.activeElement)) return false;

        return this.selection.deleteSelection();
    }

    /** Switches an active node, edge, or group Add tool back to Select; returns whether it did. */
    private exitAddTool(event: KeyboardEvent) {
        if (event.target instanceof Element && event.target.closest(ESCAPE_KEY_OWNER_SELECTOR)) return false;
        if (!this.session.read.getSessionSnapshot()) return false;
        const activeTool = this.session.read.getActiveToolSnapshot();
        const isAddTool = activeTool === 'group' || activeTool.startsWith('node:') || activeTool.startsWith('edge:');
        if (!isAddTool) return false;

        this.session.setActiveTool('select');

        return true;
    }
}

export const diagramKeyboardShortcutService = new DiagramKeyboardShortcutService(diagramSelectionService, diagramEditSessionService);
