---
author: 
id: B_350
internalId: ab825e36-710b-4c16-bd2c-59dad2825fb4
title: deleting a card jumps the scrollbar back to start
status: ready
owner: 
affects:
agents:
  - design/activity/card__ab825e36-710b-4c16-bd2c-59dad2825fb4.json
policy:
branch: b_350_deleting_a_card_jumps_the_scrollbar_back_to_start
worktree: 1
changedFiles:
  - app/src/components/card_view/card_column.tsx
  - app/src/components/card_view/card_delete_dialog.test.tsx
  - app/src/components/card_view/card_delete_dialog.tsx
  - app/src/components/card_view/card_deletion_focus.test.ts
  - app/src/components/card_view/card_deletion_focus.ts
  - app/src/components/card_view/card_view.test.tsx
  - app/src/components/card_view/card_view.tsx
  - app/src/components/card_view/project_card_drag_container.tsx
  - app/src/components/card_view/project_card_view.tsx
---

## Current state

Deleting a card from a long column can move the board scrollbar back to the start. The board and its scroll container are not remounted: card deletion emits granular lifecycle events, `useCardColumnCards` updates only the affected column, and the remaining cards keep stable keys.

The delete confirmation dialog closes before the asynchronous deletion completes. Its automatic focus restoration can target a control owned by the card or card-details popup that is being removed. The deletion flow does not select a stable replacement focus target, so browser focus restoration can move the shared board scroll container.

## Implementation details

- Before deletion, determine the next card in the deleted card's column. Use the previous card when the deleted card is last.
- Disable automatic focus restoration in `CardDeleteDialog` so the dialog does not focus a control that is being removed.
- After the card has been removed from the rendered column, focus the replacement card with `focus({ preventScroll: true })`. Identify the card by `Card.header.internalId`, not by its path.
- If the column has no remaining cards, focus its Add card button with `preventScroll`.
- Apply the same behavior when deletion starts from a board card menu or the card-details popup.
- Keep the existing granular card and column subscriptions. Do not remount the board or add a general snapshot refresh.
- Add focused tests for replacement selection, empty-column fallback, both deletion entry points, and focus with `preventScroll`.

## Acceptance criteria

- Deleting a card while scrolled down a long column does not move the board scrollbar back to the start.
- After deletion, focus moves to the next card in the same column without scrolling it. If there is no next card, focus moves to the previous card.
- Deleting the only card in a column moves focus to that column's Add card button without changing the board scroll position beyond the browser's required range.
- Deletion from the board card menu and the card-details popup has the same focus and scroll behavior.
- Cancelling the confirmation dialog retains the existing focus restoration behavior and does not delete the card.
- Only the affected column membership and deleted card are rerendered; the board scroll container remains mounted.
