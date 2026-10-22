---
author: 
id: F_446
internalId: 1a8109e1-2ead-482d-b6d0-c34fd94c0270
title: diagrams control key
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__1a8109e1-2ead-482d-b6d0-c34fd94c0270.json
policy:
branch: f_446_diagrams_control_key
worktree: 2
after: 733d678c-49a7-4409-9fa2-5fb384821513
---

When user is working with the select tool he can click on items which selects them or he can draw a box which selects the items in the box. this works ok.

However, the system does not respond to the ctrl key. when this is pressed and the user clicks on another item or draws another selection box, then the newly selected items should be added to the already selected items and not replace them.

## Current state

* Editable node, edge, and group click handlers contain a Ctrl branch that calls `DiagramSelectionService.toggle`. This branch does not produce additive selection in the integrated New diagram.
* Before click fires, `DiagramZoomViewport` handles pointer-down and calls `DiagramMoveService.beginMove`. When pressed object is not selected, `beginMove` immediately replaces selection with that object. This removes previous selection before Ctrl-click handler can add second object. Edges also suffer replacement because `beginMove` changes selection before determining that edges cannot move.
* Existing Ctrl-click test mounts `EditableDiagram` without `DiagramZoomViewport`. It tests leaf handler alone and misses pointer-down replacement from real viewport.
* Rectangle selection starts on empty surface while Select is active. `EditableDiagramSurface` does not pass Ctrl state, and `DiagramSelectionService.completeRectangleSelection` always replaces selection with intersecting objects. Zero-distance completion clears selection.
* Selection service stores stable object kind and ID pairs and publishes identity-scoped events. Selection changes do not modify diagram data or edit history.

## Implementation details

* In `DiagramZoomViewport.handlePointerDown`, do not call `DiagramMoveService.beginMove` for a selectable object while `event.ctrlKey` is true. Let existing object click handler toggle selection. Keep resize, edge drawing, placement, group drawing, pan, and plain item movement behavior unchanged.
* Keep `DiagramMoveService.beginMove` unchanged. Its only production caller remains `DiagramZoomViewport`; plain pointer-down still selects an unselected move target before dragging, and dragging an already selected object still moves complete selection.
* Add `DiagramSelectionService.completeAdditiveRectangleSelection(point)` beside existing replacement method. It completes active rectangle and replaces selection with union of current identities and intersecting identities. Existing `replace` behavior removes duplicates and emits events only for changed identities.
* In `EditableDiagramSurface.handlePointerUp`, use additive completion when Ctrl is held at pointer release; otherwise use existing replacement completion. Pointer release is commit time: releasing Ctrl before pointer release performs plain replacement.
* Ctrl-modified zero-distance or non-intersecting rectangle adds no identities and preserves selection. Plain completion keeps current clearing behavior.
* Add integrated user-interaction tests through `DiagramZoomViewport` for Ctrl-clicking nodes, edges, and groups, including removing an already selected object and confirming no move starts. Keep leaf tests, but do not treat them as integration coverage.
* Add service and viewport tests for additive rectangle selection, mixed object kinds, duplicate intersections, empty rectangles, Ctrl release timing, cancellation, inactive tools, unchanged plain selection, and unchanged diagram data and geometry.

## Acceptance criteria

* In integrated New diagram viewport, Ctrl-clicking unselected node, edge, or group adds it without removing other selected objects. Ctrl-clicking selected object removes only that object.
* Ctrl-click selection does not start move, resize, or another transient gesture and does not change object geometry.
* When Ctrl is held at rectangle pointer release, completion adds every intersecting node, edge, and group to existing selection without duplicates or removals.
* A Ctrl-modified zero-distance or non-intersecting rectangle leaves existing selection unchanged.
* Without Ctrl, item clicks and completed rectangles continue replacing selection; a plain zero-distance or non-intersecting rectangle clears selection.
* Releasing Ctrl before rectangle pointer release performs plain replacement. Cancelling pointer gesture or losing pointer capture removes transient rectangle without changing selection. Another tool cannot start or complete rectangle selection.
* Additive selection changes only selection membership. Diagram data, geometry, edit history, viewport state, and unrelated selected-state subscribers remain unchanged.
