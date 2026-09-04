---
author:
id: F_293
internalId: 6142a098-2865-430d-9ca9-a55e0ce5feff
title: add rectangle diagram selection
status: ready
owner:
affects:
agents:
  - design/activity/card__6142a098-2865-430d-9ca9-a55e0ce5feff.json
policy:
after: 91ef53f7-f3da-4b1a-acf1-ca3520128a0f
branch: f_293_add_rectangle_diagram_selection
worktree: 1
changedFiles:
  - app/src/components/diagram_view/diagram_selection_rectangle.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/components/diagram_view/editable_diagram_leaves.test.tsx
  - app/src/components/diagram_view/editable_diagram_selection.test.tsx
  - app/src/services/diagrams/diagram_rectangle_selection.test.ts
  - app/src/services/diagrams/diagram_rectangle_selection.ts
  - app/src/services/diagrams/diagram_selection_service.test.ts
  - app/src/services/diagrams/diagram_selection_service.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Select objects by dragging a rectangle on empty New surface.

## Acceptance criteria

* The marquee begins only on empty surface while Select is active.
* Nodes, edges, and groups intersecting the completed rectangle are selected.
* The visible rectangle tracks diagram coordinates through scroll and zoom.
* A zero-distance click clears selection instead of creating a marquee.
* Pointer cancellation removes the transient rectangle without changing selection.

## State and rendering rule

The transient marquee is isolated service-owned view state. Completing it applies membership differences through identity-scoped selection events. Objects whose selected state did not change, all model fields, collections, and diagram roots remain untouched.

## Dependencies

[F\_289](F_289_add_diagram_coordinate_conversion.md) and [F\_291](F_291_add_direct_diagram_selection.md).
