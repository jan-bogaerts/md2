---
author:
id: F_283
internalId: 2a79aab5-7f0a-4c3e-9259-2ffdc6878f3b
title: add tabbed diagram comparison
status: new
owner:
affects:
agents:
policy:
after: b39d6ecb-a2eb-40da-8de1-1dca68881d26
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Offer Current and New as accessible tabs when two simultaneous panes are unsuitable.

## Acceptance criteria

* The tab list contains Current and New in that order.
* Switching tabs preserves edits, selection, tool state, scroll, and zoom for each surface.
* Only New accepts edit gestures.
* Keyboard tab navigation follows the existing application pattern.

## Dependencies

[F_280](F_280_add_current_and_new_diagram_comparison.md).
