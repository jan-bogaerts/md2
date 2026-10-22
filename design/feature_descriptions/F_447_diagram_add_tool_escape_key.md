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
---
When the 'add' tool is selected in a diagram and the user has pressed ctrl while adding items or has not yet added an item, it should be possible to press the 'escape' key so that the default 'select' tool is active again.

this already seems to work for adding 'connections', just not for nodes.

## Current state

* An Add tool is active when the session active tool is `node:<kind>`, `edge:<kind>`, or `group`. Since F_407 (`design/releases/0.8.0/F_407_diagram_continuous_add_with_ctrl.md`), an add without Ctrl switches to `select`, so an Add tool stays active only before the first add or after Ctrl-adds. Fragment never stays active.
* `handleWindowKeyDown` in `app/src/components/diagram_view/surface/diagram_zoom_viewport.tsx` handles window Escape. It skips events already `defaultPrevented` and events from `input`, `textarea`, `[contenteditable="true"]`, or `[role="dialog"]`. Order today:
  1. Edge tool with a chosen source (`drawing.isDrawingActive() && drawing.hasSource()`): `drawing.cancelDrawing()`, then `session.setActiveTool('select')`. This is the case the feature calls "already works for connections".
  2. Pan gesture: cancel pan.
  3. No pointer gesture: clear New emphasis, else do nothing. So node tool, group tool, and edge tool without source stay active.
  4. Held node placement or group rectangle drag (`activePointerGestureRef` is `placement` or `group`): Escape ignored; pointer-up still commits.
  5. Resize or move: cancel gesture.
* `session.setActiveTool('select')` clears the transient gesture. Each service's `handleActiveToolChanged` listener then clears its state: `DiagramNodePlacementService.clearPlacement`, `DiagramGroupDrawingService.clearDrawing`, `DiagramEdgeDrawingService.clearDrawing`. Last selected creation tool stays, so the Add button keeps the same tool.
* Choose Add tool menu (`diagram_add_control.tsx`) handles its own Escape with `preventDefault`, so the window handler skips it. Group label dialog is a `role="dialog"`, so it keeps its own Escape close.
* Tests in `diagram_zoom_viewport.test.tsx` encode the F_407 rule: `keeps node and group Add tools active on Escape` and `keeps an edge Add tool without a chosen source active on Escape`.

## implementation details

* Partly reverses F_407 acceptance criterion 6: Escape now exits every Add tool (node, edge with or without source, group), also during a held placement or group drag. Other Escape behavior stays.
* `handleWindowKeyDown` in `diagram_zoom_viewport.tsx`: replace the edge-with-source branch with one Add tool branch, placed after the existing guards and before the pan branch. Condition: `drawing.isDrawingActive() || placement.isPlacementActive() || groupDrawing.isDrawingActive()`. Body:
  * `event.preventDefault()`, `suppressClickRef.current = false`.
  * If `activePointerGestureRef.current` is `placement` or `group`: set it to `null` and call `releaseActivePointer()`. With `activePointerIdRef` cleared, the later pointer-up is ignored, so no node or group is created.
  * If edge drawing is active: `drawing.cancelDrawing()` (as today).
  * `session.setActiveTool('select')`; service listeners clear placement preview, group preview, and edge state.
* Delete the line `if (activePointerGestureRef.current === 'placement' || activePointerGestureRef.current === 'group') return`; the new branch covers that case first.
* Add `groupDrawing` and `placement` to the `useCallback` dependency list.
* Priority: with an Add tool active and New emphasis shown, first Escape exits the Add tool, second Escape clears emphasis (same as the edge-with-source branch today).
* Pending group label (rectangle drawn, label dialog open): dialog owns Escape through the `[role="dialog"]` guard; unchanged.
* No service, tooltip, or Add control changes.
* Tests in `diagram_zoom_viewport.test.tsx`:
  * Rewrite `keeps node and group Add tools active on Escape` as: Escape with node tool active returns `select`; Escape with group tool active returns `select`; Escape during held node placement returns `select`, and the following pointer-up creates no node; Escape during a group rectangle drag returns `select`, no pending label box, and no group. Stale because F_447 reverses F_407 criterion 6.
  * Rewrite `keeps an edge Add tool without a chosen source active on Escape` to assert `select`. Same reason.
  * Add: after a Ctrl-held node add, the tool stays active and Escape returns `select`, new node stays selected.
  * Add: Escape from an `input` inside the viewport keeps the Add tool active.
  * `keeps an invalid edge target recoverable until Escape cancels it` stays valid.
* Run `diagram_zoom_viewport.test.tsx` directly and `npm run lint` in `app/`.

## acceptance criteria

1. With a node, edge, or group Add tool active and no object added yet, Escape switches the active tool to Select.
2. After adds with Ctrl held, the tool stays active; Escape switches it to Select and the last added object stays selected.
3. Escape while the mouse button is still held during node placement or group rectangle drawing cancels the gesture, creates nothing, and switches to Select.
4. Escape during an edge with a chosen source still abandons the edge and switches to Select.
5. The Add button keeps the same last selected tool after Escape.
6. Escape from an inline field, the group label dialog, or the Choose Add tool menu keeps its own behavior and does not change the active tool.
7. Escape still cancels pan, resize, and move gestures and clears emphasis when no Add tool is active.