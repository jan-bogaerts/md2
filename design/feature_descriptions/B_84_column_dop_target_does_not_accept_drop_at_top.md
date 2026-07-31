---
author: 
id: B_84
internalId: 45c37a4d-b7a0-4bca-9d19-f496ee0a8b81
title: column dop target does not accept drop at top
status: design
owner: 
affects:
agents:
policy:
after: 6fdba724-f0ab-484a-9831-0480bc6d5e8d
---

When a card is dragged to the end of a column, an 'empty drop target' is shown to show where the card would be when dropped. this works fine, however, if the card is dragged over the upper half of this 'end of list' target, the drop target moves up 1 card, so I think there is still this 50/50 rule used (upper half moves to above, lower half drops at the same location). we changed that behavior for normal cards, but apparently not for this drop target, so that should be fixed.

## Current state

`CardColumn` renders the card-sized append preview before a separate 24 px `CardColumnEndDropTarget`. The preview is not droppable. With `closestCorners`, its upper area resolves to the last sortable card and moves the preview up one position; its lower area resolves to the end target. `resolveDrop` already maps the end target to the append index without a half-position rule.

## implementation details

- Make the visible append preview and column-end hit area one droppable surface using the column drop id.
- Keep the end target mapped to `remaining.length` for empty, same-column, and cross-column drops.
- Keep card targets position-based: hovering a card inserts at that card, without upper/lower-half logic.
- Add regression coverage for both halves of the visible end target and for empty columns.

## acceptance criteria

- Dropping anywhere on the visible end target appends the card.
- The preview stays after the last card while the pointer remains anywhere over that target.
- Empty columns accept drops across their full visible target.
- Dropping over a normal card keeps existing position-based behavior.
