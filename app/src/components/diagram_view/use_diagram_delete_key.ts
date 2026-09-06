import { useCallback, useEffect } from 'react'
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'

/** Marks the root of the New diagram editor, so the Delete key can tell editor focus from unrelated focus. */
export const DIAGRAM_EDITOR_ROOT_ATTRIBUTE = 'data-diagram-editor'

const DIAGRAM_EDITOR_ROOT_SELECTOR = `[${DIAGRAM_EDITOR_ROOT_ATTRIBUTE}]`

// Focus contexts that own the Delete key themselves: text entry, dialogs, menus, and the toolbox popup, which
// `ResizablePopper` renders as `role="dialog"`.
const DELETE_KEY_OWNER_SELECTOR = [
    'input', 'textarea', 'select',
    '[contenteditable=""]', '[contenteditable="true"]',
    '[role="dialog"]', '[role="menu"]', '[role="menuitem"]', '[role="listbox"]', '[role="combobox"]', '[role="textbox"]',
].join(', ')

export interface DiagramSelectionDeletion {
    deleteSelection: () => boolean
}

/**
 * Decides whether the Delete key belongs to the diagram editor. Focus inside the editor root qualifies; so does an
 * unfocused document, because rubber-band selection suppresses focus changes and would otherwise leave the keyboard
 * unable to delete what it just selected.
 */
function deleteKeyBelongsToDiagramEditor(activeElement: Element | null) {
    if (!activeElement || activeElement === activeElement.ownerDocument.body) return true
    if (activeElement.closest(DELETE_KEY_OWNER_SELECTOR)) return false

    return !!activeElement.closest(DIAGRAM_EDITOR_ROOT_SELECTOR)
}

/**
 * Deletes the diagram selection from the Delete key through the same service operation the toolbox button uses. The
 * listener owns no diagram state and adds no notification or rerender path; it lives exactly as long as the editor
 * component that calls this hook.
 */
export function useDeleteDiagramSelectionOnDeleteKey(
    selection: DiagramSelectionDeletion | DiagramSelectionService = diagramSelectionService,
) {
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== 'Delete') return
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (!deleteKeyBelongsToDiagramEditor(document.activeElement)) return
        if (selection.deleteSelection()) event.preventDefault()
    }, [selection])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)

        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])
}
