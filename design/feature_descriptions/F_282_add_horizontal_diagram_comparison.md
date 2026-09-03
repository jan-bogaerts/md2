---
author:
id: F_282
internalId: b39d6ecb-a2eb-40da-8de1-1dca68881d26
title: add horizontal diagram comparison
status: new
owner:
affects:
agents:
policy:
after: 607f2bae-4287-47e0-9585-e8555c707264
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Show Current above New with a user-resizable divider.

## Acceptance criteria

* Current appears above New.
* Pointer and keyboard resizing preserve usable minimum heights.
* Each surface scrolls independently.
* Changing the divider does not change model geometry, zoom, selection, or the change set.

## Dependencies

[F_280](F_280_add_current_and_new_diagram_comparison.md).
