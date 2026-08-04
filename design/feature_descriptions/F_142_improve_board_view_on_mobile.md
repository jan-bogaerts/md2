---
author: 
id: F_142
internalId: 5205bb65-078a-411a-9647-0796ad14953c
title: improve board view on mobile
status: ready
owner: 
affects:
agents:
  - design/activity/card__5205bb65-078a-411a-9647-0796ad14953c.json#conversation=agent-3091898f-7991-40fd-b485-6c737add8a11
  - design/activity/card__5205bb65-078a-411a-9647-0796ad14953c.json#conversation=agent-0c93bf82-9f66-44f7-916a-a1d9e2e99548
policy:
after: 7b158d24-318d-4081-934b-b9255a0672dc
worktree: 1
---

We need to improve the board view on mobile to make it usable:

* instead of showing every column below each other on the same, long workspace, we should only show 1 column. Which column is shown, is selected from the hamburger- menu.
* on mobile, by default, cards should not be draggable. when the user swipes vertical, it should be handled by the underlying box (workspace?) and perform a scroll (default scroll behavior), so cards should not capture mouse/finger events.
* when the user does a `long-push` on a card, the board switches to 'drag' mode so that the card captures mouse/finger events again and the drag can begin.

Implementation wise: we should not try to put this all in the same workspace, instead we should have something specific for mobile which only shows 1 column. which column it shows is controlled through a service (standard pattern: service has prop & raises events, menu items set, column updates.

we also need to remove the custom 'drag' gutter components that we created, they don't work properly

## Current state

- Mobile `CardView` stacks every visible column vertically in one long board.
- Full-card dnd-kit activators use `touchAction: 'none'`; touches on cards cannot start native scrolling.
- `CardViewScrollZones` provide custom edge scrolling. Long-press currently opens card actions.

## implementation details

- Add a mobile board component that renders only selected visible column. Keep desktop `CardView` unchanged.
- Add service-owned selected mobile column state and change event. Select first visible column by default and when current selection is no longer visible.
- Show visible columns in mobile hamburger drawer; selecting one updates service and closes drawer.
- Remove `CardViewScrollZones`. Let card surfaces use native vertical touch scrolling until long-press activates drag; end drag mode on finger release or cancellation.
- Mobile drag may reorder cards only within selected column. Keep desktop cross-column drag behavior.
- Keep `Run` button as action-popup entry; long-press must not open card actions.
- Add service, menu, mobile board, scrolling, long-press, same-column drag, and desktop regression tests.

## acceptance criteria

- Mobile board shows one full-width column; first visible column is selected initially.
- Hamburger drawer lists visible columns and switches displayed column.
- Vertical swipe starting on a card scrolls board without dragging or activating card actions.
- Long-press starts card drag; card can be reordered only within current column, and release or cancellation restores scroll behavior.
- `Run` opens actions popup. Long-press does not.
- Custom edge-scroll gutters are removed. Desktop board layout and drag behavior remain unchanged.
