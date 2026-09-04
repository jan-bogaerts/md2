---
author:
id: F_287
internalId: 47be0198-e3ae-4ef7-9d06-3fcf5c7fd6b9
title: add diagram zoom in tool
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__47be0198-e3ae-4ef7-9d06-3fcf5c7fd6b9.json
policy:
after: f46ab1c9-a250-4dae-afd7-72b1afcaf3c5
branch: f_287_add_diagram_zoom_in_tool
worktree: 1
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add Zoom In to the Edit section.

## Acceptance criteria

* Each activation increases only the New viewport scale by a defined step up to a named maximum.
* Zoom is a view transformation and never modifies diagram coordinates or the change set.
* The viewport keeps its visible center stable where possible.
* The button disables at maximum zoom and has an accessible label.
* Pointer hit testing remains accurate after zoom.

## State and rendering rule

Zoom is one service-owned viewport primitive. Only the New viewport transform and controls that display or constrain zoom subscribe to it. Zoom does not publish diagram, geometry, collection, selection, comparison-root, or toolbox-root events.

## Dependencies

[F\_285](F_285_add_resizable_diagram_toolbox.md) and [F\_289](F_289_add_diagram_coordinate_conversion.md).