---
author:
id: F_282
internalId: b39d6ecb-a2eb-40da-8de1-1dca68881d26
title: add horizontal diagram comparison
status: design
owner:
affects:
agents:
policy:
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Show Current above New with a user-resizable divider.

## Acceptance criteria

* Current appears above New.
* Pointer and keyboard resizing preserve usable minimum heights.
* Each surface scrolls independently.
* Changing the divider does not change model geometry, zoom, selection, or the change set.

## State and rendering rule

The horizontal split component subscribes only to its divider position and comparison-mode state. Diagram field events stay inside New leaf components and must not rerender the split, either pane root, or Current.

## Dependencies

[F\_280](F_280_add_current_and_new_diagram_comparison.md).