---
author: 
id: F_130
internalId: 9df160a1-c669-422b-aea5-da5655c12134
title: drop card has too many renders
status: ready
owner: 
affects:
agents:
  - design/activity/card__9df160a1-c669-422b-aea5-da5655c12134.json#conversation=agent-b96a213d-d994-4a54-b335-63fae8ffbb04
  - design/activity/card__9df160a1-c669-422b-aea5-da5655c12134.json#conversation=agent-31ff5cfe-afaa-446c-b096-91db0b7020e7
policy:
after: f9a450d8-0f93-4487-99f3-23dcc07b42b2
---
it seems when dropping a card, that first the 'drop target' is removed, a full refresh is done to show the drop target is gone, then the card is added and then a final rerender is done. there is a visible glitch.

instead, removing drop target and putting the card in it's new place should be done without renders in between

## Current state

`CardView.handleDragEnd` calls `cardDragDropService.endDrag()` before `dataService.cards.moveCard()`. Clearing drag state immediately removes drop preview and overlay; card move then rebuilds project snapshot and publishes column membership changes. Destination column can therefore render once without preview or moved card, then again with moved card.

Card move already updates local files and snapshot synchronously before persistence is batched. Extra intermediate UI state comes from ordering two independent external-store updates, not storage latency.

## implementation details

- Treat valid drop's local card move and drag-state cleanup as one synchronous React render transaction. Subscribers must first observe final card order with preview and overlay cleared.
- Keep invalid drops and drag cancellation as cleanup-only paths.
- Keep move persistence, state actions, error reporting, and card ordering logic unchanged.
- Add regression coverage for cross-column and same-column drops, asserting no intermediate destination-column render between preview and final card order.

## acceptance criteria

- Valid drop replaces drop preview with moved card in one committed render.
- No frame shows destination without both drop preview and moved card.
- Source and destination card order, column counts, and drag overlay are correct immediately after drop.
- Same-column reorder, invalid drop, cancellation, persistence, and move-error handling keep current behavior.
