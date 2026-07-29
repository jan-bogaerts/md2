---
author: 
id: F_73
internalId: ac0b585c-0f35-4d48-be98-a229e98d92ae
title: drag card to first place fails
status: ready
owner: 
affects:
agents:
  - design/activity/card__ac0b585c-0f35-4d48-be98-a229e98d92ae.json#conversation=agent-66c9419d-1b97-407a-a76c-a93e977ead87
  - design/activity/card__ac0b585c-0f35-4d48-be98-a229e98d92ae.json#conversation=agent-12a0308f-d5ec-4fcf-a04b-bbb2aa77ed1f
policy:
after: 455a095f-9014-4c81-b327-87b6f3a969cc
---
# Goal

dragging a card to the first row, pushes it back to the end or the previous place it was.

Most likely, the 'after' field of the card being dragged is removed, but the new next card's `after` is probably not updated correctly

# Current state

`CardView` resolves a drop before the first card as target index `0` and calls `CardOperations.moveCard`. `computeMove` already intends to clear the moved card's `after`, point the previous first card to the moved card, and repair the moved card's old follower. Unit coverage verifies the computed updates, but no persistence-level regression test verifies the saved chain. In practice, first-position moves fail within the same column and across columns, causing the card to return to its old position or the end.

# Implementation details

- Treat index `0` as a valid insertion position in every column.
- Persist one consistent chain update: moved card gets `after: null`, previous first card gets `after: <moved internalId>`, and old follower gets the moved card's previous `after`.
- Apply the same relinking for same-column and cross-column moves; cross-column moves also update `status`.
- Keep unrelated cards unchanged and commit all affected files in one batch.
- Add persistence-level regression tests for both move variants and verify order after rebuilding the project snapshot.

# Acceptance criteria

- Moving any non-first card to first place keeps it first after save and reload.
- Same-column moves preserve one valid `after` chain with no duplicate heads.
- Cross-column moves update status and preserve valid chains in both columns.
- Only moved card, new follower, and old follower are written when their values change.
- Tests cover first-place moves within one column and across columns.
