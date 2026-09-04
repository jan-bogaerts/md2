---
author:
id: F_281
internalId: 607f2bae-4287-47e0-9585-e8555c707264
title: add vertical diagram comparison
status: design
owner:
affects:
agents:
policy:
after: b39d6ecb-a2eb-40da-8de1-1dca68881d26
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Show Current and New side by side with a user-resizable divider.

## Acceptance criteria

* Current appears on the left and New on the right.
* The divider resizes both panes with accessible pointer and keyboard controls.
* Minimum pane sizes keep both surfaces usable.
* Each pane scrolls independently.
* Resizing does not change diagram geometry, selection, or edits.

## State and rendering rule

The vertical split component subscribes only to its divider position and comparison-mode state. Diagram field events stay inside New leaf components and must not rerender the split, either pane root, or Current.

## Dependencies

[F\_280](F_280_add_current_and_new_diagram_comparison.md).