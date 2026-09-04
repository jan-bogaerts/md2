---
author:
id: F_283
internalId: 2a79aab5-7f0a-4c3e-9259-2ffdc6878f3b
title: add tabbed diagram comparison
status: ready
owner:
affects:
agents:
  - design/activity/card__2a79aab5-7f0a-4c3e-9259-2ffdc6878f3b.json
policy:
after: 607f2bae-4287-47e0-9585-e8555c707264
branch: f_283_add_tabbed_diagram_comparison
worktree: 1
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Offer Current and New as accessible tabs when two simultaneous panes are unsuitable.

## Acceptance criteria

* The tab list contains Current and New in that order.
* Switching tabs preserves edits, selection, tool state, scroll, and zoom for each surface.
* Only New accepts edit gestures.
* Keyboard tab navigation follows the existing application pattern.

## State and rendering rule

The tab owner subscribes only to the active tab. New diagram field events rerender their subscribing leaves even while New is visible, but never republish tab state or rerender the tab layout and Current.

## Dependencies

[F\_280](F_280_add_current_and_new_diagram_comparison.md).
