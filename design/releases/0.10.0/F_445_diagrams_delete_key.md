---
author: 
id: F_445
internalId: d7360813-801d-416c-8b94-d472b499317f
title: diagrams delete key
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__d7360813-801d-416c-8b94-d472b499317f.json
policy:
changedFiles:
  - app/src/services/shortcuts/diagram_keyboard_shortcut_service.test.ts
  - app/src/services/shortcuts/diagram_keyboard_shortcut_service.ts
  - design/feature_descriptions/J_63_keyboard_service_owns_shortcuts.md
after: 7ce53acc-5a73-4566-931c-96751c9dac9b
---

When user has 1 or more items selected on a diagram and presses the delete key, the items should be removed

## Current state

* `KeyboardShortcutService` (`app/src/services/shortcuts/keyboard_shortcut_service.ts`) owns the single `window` `keydown` listener. It routes each key to the global service, then to the sub keyboard service of the active workspace view. `DiagramKeyboardShortcutService` receives keys only while the diagrams view is active.
* `DiagramKeyboardShortcutService.deleteSelection` (`app/src/services/shortcuts/diagram_keyboard_shortcut_service.ts`) handles an unmodified `Delete` by calling `diagramSelectionService.deleteSelection()`, which calls `DiagramEditSessionService.removeObjects()`. The toolbox Delete button uses the same operation.
* Before deleting, `deleteKeyBelongsToDiagramEditor` still applies a focus rule from before the central keyboard service existed. It accepts the key only when nothing is focused (`document.activeElement` is the body) or when focus sits inside the editor root marked with `data-diagram-editor`. It rejects focus inside text fields, dialogs, menus, listboxes, and comboboxes.

The bug is that focus rule. Selecting with the pointer does not move focus into the editor, because rectangle selection (`EditableDiagramSurface.handlePointerDown`) and the node, edge, or group move gesture (`DiagramZoomViewport.handlePointerDown`) cancel `pointerdown`, and a cancelled `pointerdown` does not move focus. The diagram toolbox renders in the app menu, outside the editor root. So when the user clicks a toolbox button, then selects items, then presses Delete, focus is still on the toolbox button, the rule rejects the key, and nothing is removed.

The editor-root check only existed to tell diagram keys apart from keys meant for other views. The central keyboard service now does that by routing on the active view, so the check is redundant.

## Implementation details

`diagram_keyboard_shortcut_service.ts`:

* `deleteKeyBelongsToDiagramEditor`: drop the editor-root check and the "nothing focused" exception. Delete belongs to the diagram unless `document.activeElement` sits inside `DELETE_KEY_OWNER_SELECTOR` (text fields, dialogs, menus, listboxes, comboboxes). A null `activeElement` belongs to the diagram.
* `DIAGRAM_EDITOR_ROOT_SELECTOR` is then unused; remove it. Keep `DIAGRAM_EDITOR_ROOT_ATTRIBUTE`: `DiagramEditButton`, `AppMenu` (new diagram), and `EditableDiagram` use it to focus the editor root.

No change to `KeyboardShortcutService`, the selection service, the edit session, or components.

### Edge cases

* Diagrams view active without an edit session: the selection is empty, `deleteSelection()` returns false, and the key stays unhandled, so the browser default is not prevented.
* Inline title, description, and node label fields are inputs, so Delete keeps editing text there.
* While the diagrams view is active, the file tree and text view are hidden, so no other control competes for Delete.

### Tests

`diagram_keyboard_shortcut_service.test.ts`:

* Add a regression test: with focus on a button outside any diagram editor root, an unmodified Delete calls `deleteSelection` and returns true. It fails before the fix.
* The existing tests stay valid: focus on the editor root still deletes; text fields and modified keys are still ignored; an unchanged selection still reports unhandled.

## Acceptance criteria

* In the diagrams view, with focus on a diagram toolbox button, selecting one or more items by clicking or by rectangle selection and then pressing Delete removes the selected items.
* Removal uses `diagramSelectionService.deleteSelection()`, the same operation and cascade rules as the toolbox Delete button.
* Delete does nothing to the diagram while focus is in a text field, dialog, menu, listbox, or combobox, or while Ctrl, Alt, or Meta is held.
* Delete does nothing to the diagram while another workspace view is active.
