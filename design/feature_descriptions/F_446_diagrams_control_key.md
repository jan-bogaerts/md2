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
---

When user is working with the select tool he can click on items which selects them or he can draw a box which selects the items in the box. this works ok.

However, the system does not respond to the ctrl key. when this is pressed and the user clicks on another item or draws another selection box, then the newly selected items should be added to the already selected items and not replace them.

## Current state

* In the New diagram, Ctrl-click already toggles one node, edge, or group through `DiagramSelectionService.toggle`; plain click replaces selection.
* Rectangle selection starts on empty surface while Select is active. `EditableDiagramSurface` forwards only pointer coordinates, so `DiagramSelectionService.completeRectangleSelection` always replaces selection with intersecting objects. A zero-distance gesture clears selection.
* Selection service stores stable object kind and ID pairs, calculates intersecting nodes, edges, and groups, and publishes identity-scoped events. Selection changes do not modify diagram data or edit history.

## Implementation details

* In `EditableDiagramSurface`, capture `event.ctrlKey` when valid rectangle selection starts. Keep modifier state for that pointer gesture, then clear it after completion, cancellation, lost pointer capture, or tool change.
* Extend `DiagramSelectionService.completeRectangleSelection` with an additive flag. When additive, replace selection with union of current identities and rectangle intersections; existing identities remain selected and duplicates are removed by existing `replace` behavior. When not additive, keep current replacement behavior.
* Treat Ctrl plus a zero-distance or non-intersecting rectangle as adding no objects, so existing selection remains. Keep plain zero-distance and non-intersecting rectangle behavior unchanged: selection becomes empty.
* Keep existing node, edge, and group Ctrl-click handlers unchanged: Ctrl-click adds an unselected object and removes a selected object; plain click replaces selection.
* `EditableDiagramSurface` is only production caller of rectangle completion. Require an explicit additive boolean there and in service tests; do not add a compatibility default.
* Add focused service and user-interaction tests for additive rectangle selection, mixed object kinds, duplicate intersections, empty rectangles, modifier capture, cancellation, inactive tools, and unchanged plain selection.

## Acceptance criteria

* While Select is active, Ctrl-clicking an unselected New diagram node, edge, or group adds it without removing other selected objects; Ctrl-clicking a selected object removes only that object.
* When Ctrl is held as rectangle drawing starts, completing rectangle adds every intersecting node, edge, and group to existing selection without duplicates or removals.
* A Ctrl-modified zero-distance or non-intersecting rectangle leaves existing selection unchanged.
* Without Ctrl, item clicks and completed rectangles continue replacing selection; a plain zero-distance or non-intersecting rectangle clears selection.
* Releasing or cancelling pointer gesture, losing pointer capture, or leaving Select clears captured modifier state. Another tool cannot start or complete rectangle selection.
* Additive selection changes only selection membership. Diagram data, geometry, edit history, viewport state, and unrelated selected-state subscribers remain unchanged.
