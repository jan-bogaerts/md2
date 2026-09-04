---
author:
id: F_294
internalId: 21b2c59c-1c07-42c2-9bc4-4e7219a645be
title: move selected diagram objects
status: ready for implementation
owner:
affects:
agents:
policy:
after: 6142a098-2865-430d-9ca9-a55e0ce5feff
branch: f_294_move_selected_diagram_objects
worktree: 2
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Move selected nodes and groups by dragging them with Select.

## Scope

A drag on a selected or newly selected object moves the complete selection. Node movement updates persisted coordinates; independent group movement updates group coordinates. Attached edges remain attached and are rerouted through layout. Edge-only selections do not move because an edge has no independent translation.

## Acceptance criteria

* Pointer movement is converted to diagram coordinates and snapped to the existing grid.
* A drag is one semantic change regardless of pointer-move count.
* Cancelled drags restore starting geometry.
* Multi-selection preserves relative object positions.
* Moving never changes group membership.

## State and rendering rule

Dragging assigns x and y on each moved canonical object without replacing it. Pointer moves notify only moved geometry leaves and incrementally dependent routes or bounds. The diagram, collections, unmoved objects, comparison root, and toolbox do not rerender. The change tracker coalesces the scoped field updates into one semantic move.

## Dependencies

[F\_278](F_278_make_diagram_layout_compatible_with_editing.md), [F\_289](F_289_add_diagram_coordinate_conversion.md), and [F\_291](F_291_add_direct_diagram_selection.md).