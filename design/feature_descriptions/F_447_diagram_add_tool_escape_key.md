---
author: 
id: F_447
internalId: 90ca85d7-9878-4238-a36b-f662d0c8fbd8
title: diagram add tool escape key
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__90ca85d7-9878-4238-a36b-f662d0c8fbd8.json
policy:
after: d7360813-801d-416c-8b94-d472b499317f
branch: f_447_diagram_add_tool_escape_key
worktree: 3
---
When the 'add' tool is selected in a diagram and the user has pressed ctrl while adding items or has not yet added an item, it should be possible to press the 'escape' key so that the default 'select' tool is active again.

this already seems to work for adding 'connections', just not for nodes.

## Current state

* `DiagramEditSessionService` (`app/src/services/diagrams/diagram_edit_session_service.ts`) owns the active tool (`setActiveTool`, `read.getActiveToolSnapshot`) and the transient gesture (`placement`, `group`, `edge`, `pan`, `resize`, `move`). An Add tool is active when the active tool is `node:<kind>`, `edge:<kind>`, or `group`. Since F_407 (`design/releases/0.8.0/F_407_diagram_continuous_add_with_ctrl.md`), an add without Ctrl switches to `select`, so an Add tool stays active only before the first add or after Ctrl-adds. Fragment never stays active.
* `setActiveTool('select')` clears the transient gesture and dispatches tool and gesture change events. Each Add service's `handleActiveToolChanged` listener then clears its state: `DiagramNodePlacementService.clearPlacement`, `DiagramGroupDrawingService.clearDrawing` (includes pending label box), `DiagramEdgeDrawingService.clearDrawing` (source preview, sequence row). Last selected creation tool stays, so the Add button keeps the same tool.
* Escape routing: `KeyboardShortcutService` (`app/src/services/shortcuts/keyboard_shortcut_service.ts`) owns the window `keydown` listener and, while the workspace view is `diagrams`, passes keys to `DiagramKeyboardShortcutService` (`diagram_keyboard_shortcut_service.ts`). For Escape not already `defaultPrevented`, that service dispatches a cancelable `DIAGRAM_ESCAPE_REQUESTED_EVENT`. A listener marks Escape handled by calling `preventDefault()` on that request event; the service then reports the key handled.
* Both viewports listen to `DIAGRAM_ESCAPE_REQUESTED_EVENT`. Listener order follows mount order.
  * `diagram_current_viewport.tsx` cancels a Current pan or clears Current emphasis.
  * `handleDiagramEscapeRequested` in `app/src/components/diagram_view/surface/diagram_zoom_viewport.tsx` (New) skips keyboard events whose `detail.keyboardEvent.target` is inside `input`, `textarea`, `[contenteditable="true"]`, or `[role="dialog"]`. Order today:
    1. Edge tool with a chosen source (`drawing.isDrawingActive() && drawing.hasSource()`): `drawing.cancelDrawing()`, then `session.setActiveTool('select')`. This is the case the feature calls "already works for connections". It is tool-changing keyboard behavior decided in a component.
    2. Pan gesture: cancel pan.
    3. No pointer gesture: clear New emphasis, else nothing. So node tool, group tool, and edge tool without source stay active.
    4. Held node placement or group rectangle drag (`activePointerGestureRef` is `placement` or `group`): ignored; pointer-up still commits.
    5. Resize or move: cancel gesture.
* The New viewport keeps only pointer bookkeeping in refs (`activePointerIdRef`, `activePointerGestureRef`, `suppressClickRef`). `handleTransientGestureChanged` in `diagram_zoom_viewport.tsx` drops its gesture ref, resets `suppressClickRef`, and releases the captured pointer when the session's transient gesture no longer matches, so a later pointer-up commits nothing.
* Choose Add tool menu (`diagram_add_control.tsx`) handles its own Escape with `preventDefault` on the keyboard event, so `DiagramKeyboardShortcutService` skips it. Group label dialog is `role="dialog"`.
* Tests in `diagram_zoom_viewport.test.tsx` encode the F_407 rule: `keeps node and group Add tools active on Escape` and `keeps an edge Add tool without a chosen source active on Escape`. `keeps an invalid edge target recoverable until Escape cancels it` covers the edge-with-source branch. These tests start the real `keyboardShortcutService`, but the viewport gets a harness `DiagramEditSessionService`, not the singleton.

## implementation details

* Partly reverses F_407 acceptance criterion 6: Escape now exits every Add tool (node, edge with or without source, group), also during a held placement or group drag. Other Escape behavior stays.
* Ownership: Escape for Add tools moves into `DiagramKeyboardShortcutService`, because it only changes session state. Viewports keep only pointer-local cancels (pan, resize, move) and emphasis.
* `DiagramKeyboardShortcutService`:
  * Constructor takes a second dependency `session: DiagramEditSessionAccess<'getActiveToolSnapshot' | 'getSessionSnapshot', 'setActiveTool'>`. The singleton passes `diagramEditSessionService`. Call sites: the singleton and `diagram_keyboard_shortcut_service.test.ts`.
  * In `handleKeyDown`, for Escape, before dispatching `DIAGRAM_ESCAPE_REQUESTED_EVENT`, call a private method `exitAddTool(event)`:
    * Return `false` when the Escape target is inside `input, textarea, [contenteditable="true"], [role="dialog"]` (module constant next to `DELETE_KEY_OWNER_SELECTOR`), when no edit session exists, or when the active tool is not an Add tool (`node:` or `edge:` prefix, or `group`).
    * Otherwise call `session.setActiveTool('select')` and return `true`.
  * If `exitAddTool` returns `true`, return `true` (handled; no request event). Else dispatch the request as today.
* Effects of `setActiveTool('select')`; no extra calls needed:
  * Edge: `DiagramEdgeDrawingService.handleActiveToolChanged` clears the source preview; the session clears the `edge` transient gesture.
  * Held placement or group drag: the transient gesture becomes `null`; `handleTransientGestureChanged` in the viewport clears `activePointerGestureRef`, releases the pointer, and resets `suppressClickRef`. The pointer-up is ignored, so no node or pending label box is created.
* `handleDiagramEscapeRequested` in `diagram_zoom_viewport.tsx`: delete the edge-with-source branch and the `placement`/`group` early return; drop `drawing` and `session` from its dependency list if no longer used. Pan, emphasis, resize, and move branches stay.
* Priority: Add tool exit runs before the request event, so with an Add tool active, first Escape exits the tool; a next Escape clears emphasis (New or Current) or cancels a Current pan.
* Pending group label dialog owns Escape through the `[role="dialog"]` skip; unchanged.
* No session, Add service, tooltip, or Add control changes.
* Tests:
  * `diagram_keyboard_shortcut_service.test.ts` (session stub): Escape with `node:component`, `edge:connection`, or `group` calls `setActiveTool('select')`, returns `true`, and dispatches no request; Escape with `select` or `pan` dispatches the request; Escape from an `input` or inside `[role="dialog"]` with an Add tool active leaves the tool; no edit session leaves the tool. Update existing tests to pass the session stub.
  * `diagram_zoom_viewport.test.tsx`: remove `keeps node and group Add tools active on Escape` and `keeps an edge Add tool without a chosen source active on Escape` (stale: F_447 reverses F_407 criterion 6, and Escape for Add tools is now covered by the keyboard service tests). Rewrite the Escape part of `keeps an invalid edge target recoverable until Escape cancels it` to call `session.setActiveTool('select')` and assert the preview is cleared (Escape moved to the service). Add: during a held node placement and during a group rectangle drag, `session.setActiveTool('select')` followed by pointer-up creates no node, no pending label box, and no group. Resize, move, and pan Escape tests stay.
* Run `diagram_keyboard_shortcut_service.test.ts` and `diagram_zoom_viewport.test.tsx` directly, and `npm run lint` in `app/`.

## acceptance criteria

1. In the diagrams view, with a node, edge, or group Add tool active and no object added yet, Escape switches the active tool to Select.
2. After adds with Ctrl held, the tool stays active; Escape switches it to Select and the last added object stays selected.
3. Escape while the mouse button is still held during node placement or group rectangle drawing cancels the gesture, creates nothing, and switches to Select.
4. Escape during an edge with a chosen source still abandons the edge and switches to Select.
5. The Add button keeps the same last selected tool after Escape.
6. Escape from an inline field, the group label dialog, or the Choose Add tool menu keeps its own behavior and does not change the active tool.
7. With an Add tool active, first Escape exits the tool only; a next Escape clears emphasis. Without an Add tool, Escape still cancels pan, resize, and move gestures and clears emphasis.
8. Escape handling for Add tools lives in `DiagramKeyboardShortcutService`; `diagram_zoom_viewport.tsx` no longer changes the active tool on Escape.
