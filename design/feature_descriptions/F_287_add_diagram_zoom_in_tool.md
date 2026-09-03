---
author:
id: F_287
internalId: 47be0198-e3ae-4ef7-9d06-3fcf5c7fd6b9
title: add diagram zoom in tool
status: new
owner:
affects:
agents:
policy:
after: f46ab1c9-a250-4dae-afd7-72b1afcaf3c5
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add Zoom In to the Edit section.

## Acceptance criteria

* Each activation increases only the New viewport scale by a defined step up to a named maximum.
* Zoom is a view transformation and never modifies diagram coordinates or the change set.
* The viewport keeps its visible center stable where possible.
* The button disables at maximum zoom and has an accessible label.
* Pointer hit testing remains accurate after zoom.

## Dependencies

[F_285](F_285_add_resizable_diagram_toolbox.md) and [F_289](F_289_add_diagram_coordinate_conversion.md).
