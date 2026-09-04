---
author:
id: F_295
internalId: f24dc638-db21-4d13-b5ec-bf173913a69b
title: resize selected diagram objects
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__f24dc638-db21-4d13-b5ec-bf173913a69b.json
policy:
after: 21b2c59c-1c07-42c2-9bc4-4e7219a645be
branch: f_295_resize_selected_diagram_objects
worktree: 1
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Resize selected nodes and groups through visible handles.

## Acceptance criteria

* A single resizable selection shows accessible corner and edge handles.
* Nodes and independent groups write explicit width and height on the grid.
* Named minimum sizes prevent invalid or unusable geometry.
* Attached endpoints follow resized node boundaries.
* Edge-only and multi-object selections do not show unsupported handles.
* Cancelled resize restores the starting geometry and creates no change.

## State and rendering rule

Resizing assigns width and height on the existing selected object. Only that object's geometry leaves, incident endpoint or route leaves, and a changed surface bound may receive events. No complete object, collection, positioned diagram, or diagram root is rebuilt.

## Dependencies

[F\_274](F_274_add_editable_connection_points.md), [F\_289](F_289_add_diagram_coordinate_conversion.md), and [F\_291](F_291_add_direct_diagram_selection.md).