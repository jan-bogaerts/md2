---
author: 
id: B_298
internalId: 04c53429-e249-4be6-8a62-8480a72be879
title: new sequence popup only accepts 1 drop
status: ready
owner: 
affects:
agents:
  - design/activity/card__04c53429-e249-4be6-8a62-8480a72be879.json
policy:
changedFiles:
  - app/src/components/actions/run/sequence/card_sequence_collision.test.ts
  - app/src/components/actions/run/sequence/card_sequence_collision.ts
  - app/src/components/actions/run/sequence/card_sequence_dialog.test.tsx
  - app/src/components/actions/run/sequence/card_sequence_dialog.tsx
  - app/src/components/actions/run/sequence/card_sequence_drag_overlay.test.tsx
  - app/src/components/actions/run/sequence/card_sequence_drag_overlay.tsx
  - app/src/components/actions/run/sequence/card_sequence_row.tsx
  - app/src/components/card_view/card_view.test.tsx
  - app/src/components/card_view/card_view.tsx
  - app/src/components/card_view/mobile_card_view.tsx
---
The 'new sequence' popup shows a drop target where the user can drop cards on. this works, but as soon as the first card is dropped, the drop target disappears and no more cards can be dropped.&#x20;

Things that need fixing:&#x20;

* show drop target always at bottom so new cards can be added
* allow dropping on another entry to take it's place. the existing item will move 1 down
* also, no need to show the file path.

## Current state

`CardSequenceDialog` renders inside desktop and mobile board `DndContext`. Its empty-list prompt and dashed border disappear after first card, though the surrounding list remains droppable. Each `CardSequenceRow` is sortable. Dropping a board card on a row inserts it before that row; dropping a sequence row on another row reorders it. Both operations lack a clear insertion cue, and row dragging lacks a distinct moving-card state. Rows also display `card.path` below the card title.

`CardView` and `MobileCardView` handle both drop types. `cardSequenceCollision` selects sequence targets; `CardSequenceDraftService` stores order by `cardInternalId`, prevents duplicates, and rejects cards with a worktree assignment.

## Implementation details

* `card_sequence_dialog.tsx`: keep a visible append target below sequence rows, including when list has cards. It uses `CARD_SEQUENCE_DROP_ID`; dropping there appends. Give target an allowed-drop highlight while a permitted card or sequence row is over it.
* `card_sequence_row.tsx`: remove file path. Show a clear insertion position on the hovered row for allowed board-card drops and sequence reorders. Show the dragged sequence row moving with pointer, visually raised from its source position; keep its source position and destination distinguishable until drop or cancel.
* Use drag state from the existing board `DndContext` in both `CardView` and `MobileCardView` as needed to render the moving row and target feedback. Keep `cardSequenceDraftService.addCard` and `reorderCard` as the order-changing operations. Clear drag feedback after drop or cancel. Do not signal an allowed drop for duplicate or worktree-assigned cards.
* Add focused component and interaction tests for append target, insertion feedback, moving row, reorder, cancel cleanup, and hidden path. Run affected tests; no full suite needed.

## Acceptance criteria

* Empty and populated sequence lists show a bottom target. Dropping a permitted board card there appends it; dropping one on an existing row inserts it before that row, shifting that row and later rows down.
* While a permitted card hovers over a row or bottom target, popup visibly marks exact insertion position. Marker clears when drag leaves, ends, or is cancelled. Invalid cards show no allowed-drop marker and do not enter sequence.
* Dragging a sequence row by its handle shows that row moving with pointer and a clear allowed insertion position. Dropping on a row moves it before that row; dropping on bottom target moves it to end. Cancel leaves order unchanged and clears drag visuals.
* Sequence rows show card ID and title, with no file path. Desktop and mobile retain existing add, remove, select, and submit behavior.
