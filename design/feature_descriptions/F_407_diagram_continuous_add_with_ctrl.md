---
author: 
id: F_407
internalId: ecdd9654-d1ba-4f4f-9fcc-27997480e062
title: Diagram continuous add with ctrl
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__ecdd9654-d1ba-4f4f-9fcc-27997480e062.json
policy:
---

When edting diagrams, the ´add tool´ currently always uses a ´continuous add´ method until user presses escape or selects different tool.

We need to change this behaviour so that the ´continuous add´ only works while the ´ctrl´ key is pressed. So no more need for ´esc´.

Include info in tooltip of ´add tool´ so that user knows.

## Current state

* `app/src/components/diagram_view/creation_tools/diagram_add_control.tsx` renders the Add button (last selected creation tool) and the Choose Add tool menu. `activateCreationTool` starts one of four flows: node placement, edge drawing, group drawing, or the sequence fragment dialog. The Add button tooltip is `Add <label>`, or `Choose an Add tool` when no tool exists.
* Continuous add means: after one object is created, the same Add tool stays active, so the next click creates another object. Today every flow is continuous:
  * `DiagramNodePlacementService.place` creates the node, selects it, and keeps `node:<kind>` active. Exception: placing a mindmap `root` immediately activates the Topic tool (`MINDMAP_TOPIC_PLACEMENT`).
  * `DiagramEdgeDrawingService.completeTarget` creates the edge, selects it, and keeps `edge:<kind>` active. Clicking empty canvas instead of a target node keeps the source preview.
  * `DiagramGroupDrawingService.finishDrawing` stores the drawn rectangle as a pending label box; `completeGroup` (called by `diagram_group_label_form.tsx`) creates the group and keeps `group` active. Cancelling the label dialog calls `cancelDrawing`, which also keeps `group` active.
  * The fragment flow sets active tool `fragment` and opens `DiagramFragmentDialog`. Closing that dialog leaves `fragment` active, so the Add button stays pressed.
* `app/src/components/diagram_view/surface/diagram_zoom_viewport.tsx` drives canvas gestures: node placement commits on pointer-up (`place`), an edge commits on the pointer-down that hits a target node (`completeTarget`), a group rectangle finishes on pointer-up (`finishDrawing`). `handleWindowKeyDown` makes Escape cancel the active edge, node, or group tool and switch to `select`. Besides choosing another tool, Escape is the only way to stop adding.
* Switching to `select` already clears placement/drawing state through each service's `handleActiveToolChanged` listener. `DiagramSelectionService` keeps the current selection on tool change, so the newly created object stays selected.
* No add flow reads the Ctrl modifier. Ctrl-click on nodes/edges/groups toggles multi-selection, but active add gestures set `suppressClickRef`, so that click handler does not fire while adding.

## implementation details

* Rule: Ctrl state is read at the moment an add commits. Ctrl held: tool stays active (continuous add). Ctrl not held: after the successful add, active tool becomes `select`. Releasing Ctrl alone changes nothing. A failed add (service returns `null`) keeps the tool active so the user can retry. Read `event.ctrlKey` only, as the feature specifies.
* `DiagramNodePlacementService.place(point, continueAdding)`: after a successful create, if `definition.kind === 'root'`, keep the existing switch to `MINDMAP_TOPIC_PLACEMENT` regardless of Ctrl; otherwise call `this.session.setActiveTool('select')` when `continueAdding` is false. Only call site: `handlePointerUp` in `diagram_zoom_viewport.tsx`, passing `event.ctrlKey`.
* `DiagramEdgeDrawingService.completeTarget(nodeId, point, continueAdding)`: after a successful create, call `this.session.setActiveTool('select')` when `continueAdding` is false. Only call site: `handlePointerDown` in `diagram_zoom_viewport.tsx`, passing `event.ctrlKey`.
* `DiagramGroupDrawingService.finishDrawing(point, continueAdding)`: store `continueAdding` next to the pending label box (reset in `clearDrawing`). Ctrl is read on rectangle release, because the label dialog submit is a keyboard/button action. `completeGroup` keeps its signature (call site `diagram_group_label_form.tsx` unchanged); after a successful create it calls `this.session.setActiveTool('select')` when the stored value is false. Cancelling the label dialog keeps current behavior (tool stays `group`). Only `finishDrawing` call site: `handlePointerUp` in `diagram_zoom_viewport.tsx`, passing `event.ctrlKey`.
* Fragment: in `activateCreationTool`, replace `session.setActiveTool('fragment')` with `session.setLastSelectedCreationTool('fragment')` followed by `session.setActiveTool('select')`, then `fragmentDialog.openCreate()`. The Add button keeps Fragment as last selected tool; after the dialog closes (save or cancel) the active tool is Select. Fragments get no Ctrl continuous mode.
* Remove Escape handling for add tools, except abandoning an edge: in `handleWindowKeyDown` in `diagram_zoom_viewport.tsx`, delete the node placement and group drawing branches, and limit the edge drawing branch to `drawing.isDrawingActive() && drawing.hasSource()`. That branch keeps its current behavior: `drawing.cancelDrawing()` followed by `session.setActiveTool('select')`. Escape with an edge tool active but no source chosen does nothing. Keep Escape for pan, resize, move, and emphasis. Dialogs (group label, fragment) keep their own Escape close. Pointer-cancel and lost pointer capture still cancel node/group gestures.
* Tooltip: Add button tooltip becomes `Add <label> (hold Ctrl to add multiple)` for node, edge, and group tools; Fragment keeps `Add Fragment`. `aria-label` stays `Add <label>`, so existing role queries keep working. `Choose an Add tool` stays unchanged.
* Tests:
  * Service tests (`diagram_node_placement_service.test.ts`, `diagram_edge_drawing_service.test.ts`, `diagram_group_drawing_service.test.ts`): with `continueAdding` true the tool stays active; with false it becomes `select` and the new object stays selected; failed creates keep the tool; mindmap root still switches to Topic without Ctrl.
  * `diagram_zoom_viewport.test.tsx`: pointer events with and without `ctrlKey` for node, edge, and group. `keeps an invalid edge target recoverable until Escape cancels it` stays valid (edge with source). Review `leaves Add active when an inline field or dialog owns Escape` and other tests asserting Escape exits node or group tools; those become stale by intent and must be rewritten to the new behavior. Add a test: Escape with an edge tool but no source keeps the tool active. Pan/resize Escape tests stay.
  * `diagram_add_control.test.tsx`: tooltip text for a node tool and for Fragment; Fragment activation opens the dialog, keeps Fragment as last selected tool, and leaves active tool `select`.
* Run affected test files independently and `npm run lint` in `app/`.

## acceptance criteria

1. Without Ctrl, adding one node, edge, or group returns the active tool to Select; the new object stays selected and the Add button keeps the same last selected tool.
2. With Ctrl held when the add commits (node: mouse release; edge: click on target node; group: mouse release of the rectangle), the tool stays active and the next add uses the same tool.
3. Placing a mindmap root still switches to the Topic tool; Topic adds then follow criteria 1 and 2.
4. A failed add (invalid target, rejected create) keeps the tool active.
5. Choosing Fragment opens the fragment dialog; after it closes, the active tool is Select and the Add button still offers Fragment.
6. Escape no longer cancels or exits node or group add tools, nor an edge tool without a chosen source. Escape still abandons an edge whose source is chosen but target is not, then returns to Select. Escape still cancels pan, resize, and move gestures, clears emphasis, and closes dialogs.
7. Hovering the Add button for a node, edge, or group tool shows `Add <label> (hold Ctrl to add multiple)`.