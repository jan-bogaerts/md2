---
author: 
id: F_445
internalId: d7360813-801d-416c-8b94-d472b499317f
title: diagrams delete key
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__d7360813-801d-416c-8b94-d472b499317f.json
policy:
changedFiles:
  - design/feature_descriptions/J_63_keyboard_service_owns_shortcuts.md
after: 223f749a-dd16-4a42-b8de-3ce63eab686d
---

When user has 1 or more items selected on a diagram and presses the delete key, the items should be removed

## Current state

Delete key support already exists from [F\_298](../releases/0_6_0/F_298_add_diagram_delete_key_support.md):

* `useDeleteDiagramSelectionOnDeleteKey` in `app/src/components/diagram_view/editing/use_diagram_delete_key.ts` installs a `window` `keydown` listener. On an unmodified `Delete` it calls `diagramSelectionService.deleteSelection()`, which calls `DiagramEditSessionService.removeObjects()`. The toolbox Delete button (`diagram_delete_button.tsx`) uses the same operation.
* `EditableDiagram` (`editable_diagram.tsx`) calls the hook and marks its root `Box` with `data-diagram-editor` and `tabIndex={-1}`.
* `deleteKeyBelongsToDiagramEditor` accepts the key only when `document.activeElement` is the body (nothing focused) or sits inside the editor root, and not inside a text field, dialog, menu, listbox, or combobox.

The gap is focus. Selecting items with the pointer does not move keyboard focus into the editor:

* Rectangle selection: `EditableDiagramSurface.handlePointerDown` calls `event.preventDefault()`.
* Clicking a node, edge, or group in the Select tool: `DiagramZoomViewport.handlePointerDown` starts a move gesture and calls `event.preventDefault()`.

A cancelled `pointerdown` suppresses the browser's `mousedown` default action, which is the step that moves focus. So focus stays wherever it was before. The diagram toolbox (`DiagramMenuTab`) renders in the app menu, outside the editor root. Typical failing sequence: user clicks a toolbox button (Select, Add tool, Cut, Copy, Paste), then selects items in the diagram, then presses Delete. Focus is still on the toolbox button, so the ownership check rejects the key and nothing is removed. Focus only reaches the editor root right after "Edit diagram" or "New diagram", or when nothing is focused.

This cause comes from code reading. It was not reproduced in the running app.

## Implementation details

Pointer interaction inside the editor claims keyboard focus for the editor root, so the existing Delete handler accepts the key. The Delete handler itself does not change.

1. `use_diagram_delete_key.ts`: export `DELETE_KEY_OWNER_SELECTOR` so the focus rule reuses the same list of focus contexts that own their keys.
2. New file `app/src/components/diagram_view/editing/diagram_editor_focus.ts` with a module-level function `claimDiagramEditorFocus(event: PointerEvent<HTMLElement>)`:
   * Return when `event.target` is not DOM-contained by `event.currentTarget`. React pointer events bubble through portals, so pointer-downs in the portaled details, fragment, review, and group label dialogs must not move focus.
   * Return when `event.target` is inside `DELETE_KEY_OWNER_SELECTOR`. Inline title, description, and node label fields keep receiving focus from the browser.
   * Return when `event.currentTarget` already contains `document.activeElement`. A focused node or edge keeps its focus.
   * Otherwise call `event.currentTarget.focus({ preventScroll: true })`. `preventScroll` keeps the scroll position stable when the root is larger than the viewport.
3. `EditableDiagram`: set `onPointerDownCapture={claimDiagramEditorFocus}` on the root `Box`. The capture phase runs before the surface and viewport handlers cancel the event, and it does not depend on which gesture runs.

No service, event, or state change. `EditableDiagram` still subscribes to no diagram state.

### Edge cases

* Pan, Add tool placement, and connection drawing also claim focus. This is harmless and lets later key handling (for example F\_447 Escape) rely on editor focus.
* Right-click on a node or edge claims focus, then the item menu takes focus. When the menu closes it restores focus to its anchor, which is inside the editor root.
* Clicks on the scroller padding outside the editor root do not claim focus. They also start no selection.
* The read-only "Current" diagram has no editor root and no Delete behavior. No change.

### Tests

Add to `use_diagram_delete_key.test.tsx`, in the `EditableDiagram Delete key wiring` block, using the real `DiagramSelectionService`:

* Regression: focus a button outside the editor, `pointerDown` on the "Orders" node, select it, press Delete, expect the node removed. This fails before the fix because jsdom, like a cancelled pointer-down in the browser, does not move focus.
* Focus a button outside the editor, `pointerDown` on the inline title field, expect focus not on the editor root.

Add `diagram_editor_focus.test.tsx` for `claimDiagramEditorFocus`: claims focus from outside, keeps focus already inside the root, ignores targets outside the root's DOM (portal case), ignores key-owner targets.

Existing tests in `use_diagram_delete_key.test.tsx` must keep passing unchanged.

## Acceptance criteria

* With focus on a diagram toolbox button, selecting one or more items by clicking or by rectangle selection and then pressing Delete removes the selected items.
* Removal uses `diagramSelectionService.deleteSelection()`, the same operation and cascade rules as the toolbox Delete button.
* Delete still does nothing while focus is in a text field, dialog, menu, or action popup, and does nothing with Ctrl, Alt, or Meta held.
* A pointer-down inside a portaled diagram dialog or an inline text field does not move focus to the editor root.
* Selecting items does not scroll the diagram.
