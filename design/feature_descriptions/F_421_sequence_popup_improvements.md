---
author: 
id: F_421
internalId: 6de5732e-480f-4ffa-af7b-d4ce6990ba3b
title: sequence popup improvements
status: ready
owner: 
affects:
agents:
  - design/activity/card__6de5732e-480f-4ffa-af7b-d4ce6990ba3b.json
policy:
changedFiles:
  - app/src/components/actions/run/sequence/card_sequence_dialog.test.tsx
  - app/src/components/actions/run/sequence/card_sequence_dialog.tsx
after: cb89d441-e2d8-4006-bfbb-40df58243bba
---

When clicking `add sequence`, not certain if we currently show a dialog or popup, but it is currently not possible to drag it around. this needs to be possible so we can easily drag cards into it

## Current state

`Add sequence` (`AppMenu`, `MobileCreateMenu`) calls `cardPopupService.openSequence(anchor)`. `CardSequenceDialog` renders for that `sequence` entry inside a non-modal `ResizablePopper` (a popup, not a modal dialog), hosted in the board `DndContext` by `CardView` and `MobileCardView`. Its card list is a dnd-kit droppable (`CARD_SEQUENCE_DROP_ID`), so board cards can already be dropped on it.

`CardSequenceDialog` already passes `draggable` to `ResizablePopper`, but marks its title with `data-popper-drag-handle`. `ResizablePopper.startDrag` only starts a move when the pointer-down target is inside `[data-drag-handle="true"]`. No element matches, so the popup never moves. Other draggable popups (`ActionPopupFrame`, `CardBodyPopover`) use `data-drag-handle="true"`, set it only when not mobile, and show `cursor: move` on the handle.

No `CardSequenceDialog` test covers dragging.

## Implementation details

* `card_sequence_dialog.tsx`: replace `data-popper-drag-handle` on the `DialogTitle` with `data-drag-handle={!isMobile ? 'true' : undefined}` and add `cursor: move` when not mobile, matching `ActionPopupFrame`.
* No change to `ResizablePopper`, `cardPopupService`, or the sequence droppable. Drag is pointer-down on the title, then the popup detaches from its anchor and follows the pointer (existing `ResizablePopper` behavior, clamped to the viewport).
* The `CardSequenceActionSelector` sits below the title in the same header `Box`, outside the handle, so its buttons are not affected.
* Mobile: no drag handle, same as other popups.
* Tests: add to `card_sequence_dialog.test.tsx` a desktop test that pointer-downs on the `Add card sequence` heading, moves the pointer, and asserts the popup's `left`/`top` changed. Run `card_sequence_dialog.test.tsx` and `resizable_popper.test.tsx`.

## Acceptance criteria

* On desktop, dragging the `Add card sequence` title moves the popup. It stays within the viewport and keeps its size.
* The title shows a move cursor on desktop.
* After moving, board cards can still be dropped into the sequence card list, and rows inside the list can still be reordered.
* Controls in the popup (action selector, selects, buttons, resize handles) work as before.
* On mobile, the title is not a drag handle.