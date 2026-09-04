---
author:
id: F_284
internalId: 2023c646-c9c0-43ae-92f7-5619042cb465
title: add diagram comparison layout selector
status: new
owner:
affects:
agents:
policy:
after: 056265ee-3d0f-4922-8e2d-282f91bad667
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Let the user choose vertical, horizontal, or tabbed comparison without restarting the edit session.

## Acceptance criteria

* All three modes are available through labelled controls.
* Changing mode preserves original data, editable data, dirty state, selection, and active tool.
* The chosen mode remains stable while navigating inside the active edit session.
* Mobile presentation remains usable and does not overflow the workspace.

## State and rendering rule

The layout owner subscribes only to the comparison-mode primitive. It receives stable pane components or services, not complete diagram objects. A child field event cannot change the mode snapshot or rerender the selector and comparison root.

## Dependencies

[F_281](F_281_add_vertical_diagram_comparison.md), [F_282](F_282_add_horizontal_diagram_comparison.md), and [F_283](F_283_add_tabbed_diagram_comparison.md).
