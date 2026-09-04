---
author:
id: F_289
internalId: 71998afb-3b7f-4da7-87e4-95e5c931a702
title: add diagram coordinate conversion
status: ready for implementation
owner:
affects:
agents:
policy:
after: cd8c317c-a566-4ec1-bc4b-e598c892ea89
branch: f_289_add_diagram_coordinate_conversion
worktree: 3
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Provide one tested conversion between client, viewport, and diagram coordinates.

## Scope

Account for viewport bounds, independent scrolling, zoom, and comparison layout. Expose a reusable pure conversion used by marquee selection, placement, moving, resizing, and edge drawing.

## Acceptance criteria

* The same pointer location resolves to the expected diagram point at every supported zoom.
* Scrolling either comparison pane cannot offset gestures in the other pane.
* Conversion has no DOM writes and is covered by unit tests.
* Tools do not implement their own coordinate formulas.

## State and rendering rule

Coordinate conversion is a pure read of the relevant viewport metrics and zoom primitive. It creates no state, dispatches no event, and cannot cause diagram or layout components to rerender.

## Dependencies

[F\_280](F_280_add_current_and_new_diagram_comparison.md).