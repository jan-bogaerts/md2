---
author: 
id: B_232
internalId: 5c3ce7b1-898e-4a38-b281-0f6fc89e2bb9
title: latest changes broke opening cards
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__5c3ce7b1-898e-4a38-b281-0f6fc89e2bb9.json
policy:
---

opening a card now takes very long. see trace: [Trace-20260914T100720.json](file:///C:/Users/janbo/Documents/dev/Trace-20260914T100720.json): this is just opening and closing a card (in the background, an agent was also running). but you can clearly see big slow down while opening & closing the card. this is not normal I suspect the latest changes (most likely diagrams) has broken something.

what is occurring? why is the open and close taking so long? what is happening that shouldnt?

## Current state

* Trace records one card-open click blocking renderer main thread for 3.227 seconds and one card-close click blocking it for 2.267 seconds.
* Both clicks render all five `CardColumn` instances and all 161 `CardView` instances. Trace contains 322 begin/end events each for `CardView` and `CardViewContent`, plus repeated MUI menus, tooltips, and dialogs owned by every card. Opening should render popup host and selected card only; closing should unmount popup and update selected card only.
* Cause starts in `useCardPopupBackDismiss`. Hook subscribes to complete `CardPopupService` entry array through `useSyncExternalStore` and is called inside `ProjectWorkspace`. `CardPopupService.setEntries` creates new array when any popup opens or closes. New snapshot rerenders `ProjectWorkspace`; board handlers are recreated; changed handler props bypass `CardView` memoization; every card subtree renders.
* Hook arrived in September 12 change that also contained diagram work. Trace shows popup update and board-wide card rendering, not diagram layout or diagram rendering, inside slow clicks. Diagram changes are correlated by commit timing but do not cause delay.
* Popup-specific work remains valid: opening mounts `CardBodyPopover` and Markdown editor; closing unmounts them. Board-wide rendering is invalid extra work.

## implementation details

* Add zero-output `CardPopupBackDismiss` leaf component in its own file. Component calls `useCardPopupBackDismiss()` and returns `null`.
* Render leaf once beside popup hosts in `ProjectWorkspace`. Remove direct `useCardPopupBackDismiss()` call from `ProjectWorkspace`, so popup entry changes rerender only leaf subscription boundary.
* Keep `CardPopupService`, `subscribeCardPopups`, and hook behavior unchanged. Only verified hook call site is `ProjectWorkspace`; it receives new boundary. Existing mobile browser registration count, stacked-popup order, close callback, wide-screen behavior, and Electron behavior stay unchanged.
* Keep per-card popup subscription in `project_card_view.tsx`. Its boolean snapshot changes only for card identified by `Card.header.internalId`, so selected card alone updates open styling.
* Add regression coverage proving popup open and close do not rerender a stable board sibling or all `CardView` instances. Keep existing `use_card_popup_back_dismiss.test.tsx` cases for stacked popups, wide screens, and Electron.

## acceptance criteria

* Opening card details renders popup-specific content and selected card; unaffected cards, card columns, file tree, text view, stats view, and diagram view do not rerender because popup entry array changed.
* Closing card details unmounts popup-specific content and updates selected card; it does not rerender board-wide card subtrees.
* Performance trace with same project no longer contains 161 `CardView` renders inside open or close click task, and neither click has board-wide React work as long-task cause.
* On small-screen browser, one back press still closes one top card popup. Two stacked popups still require two presses.
* Wide-screen browser and Electron still create no mobile back-dismiss registrations or history entries.
