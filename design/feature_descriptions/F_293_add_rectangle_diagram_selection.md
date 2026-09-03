---
author:
id: F_293
internalId: 6142a098-2865-430d-9ca9-a55e0ce5feff
title: add rectangle diagram selection
status: new
owner:
affects:
agents:
policy:
after: 91ef53f7-f3da-4b1a-acf1-ca3520128a0f
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Select objects by dragging a rectangle on empty New surface.

## Acceptance criteria

* The marquee begins only on empty surface while Select is active.
* Nodes, edges, and groups intersecting the completed rectangle are selected.
* The visible rectangle tracks diagram coordinates through scroll and zoom.
* A zero-distance click clears selection instead of creating a marquee.
* Pointer cancellation removes the transient rectangle without changing selection.

## Dependencies

[F_289](F_289_add_diagram_coordinate_conversion.md) and [F_291](F_291_add_direct_diagram_selection.md).
