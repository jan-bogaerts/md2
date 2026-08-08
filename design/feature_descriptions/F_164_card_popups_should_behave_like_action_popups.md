---
author: 
id: F_164
internalId: 1282901d-fbea-459b-92ab-6d82708948df
title: card popups should behave like action popups
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__1282901d-fbea-459b-92ab-6d82708948df.json#conversation=agent-85290abc-db1b-4200-8856-7e78314f19d9
  - design/activity/card__1282901d-fbea-459b-92ab-6d82708948df.json#conversation=agent-f1e24665-1f79-45c1-827b-1fecfaea31bc
policy:
branch: f_164_card_popups_should_behave_like_action_popups
worktree: 2
---

Currently, we can move action-popups around, we can open multiple at the same time, resize them fully.

The same should be possible with card-popups. they should behave exactly the same.

so the same popup manager should be used to determine which is the top popup.

## Current state

`CardBodyPopoverService` stores one snapshot. Opening another card replaces the open card, so only one card-details popup can exist. `CardBodyPopover` uses modal `ResizablePopover`: it has a backdrop, stays anchored, cannot be dragged, and is not part of action-popup stack order.

Card action popups differ. `CardActionPopupService` stores one stable entry per open popup, `CardActionPopupHost` renders all entries, and `ResizablePopper` supports dragging, eight-direction resizing, persisted desktop size, and activation by pointer or keyboard focus. Entry order supplies `stackPosition`; highest position means top popup.

Card-details editing also assumes one popup. Global `cardMarkdownDataSource` has one `board-card` target, so a second editor would replace the first editor's active document. Card diff selection, fullscreen state, title draft, history store, save status, and delete dialog are likewise owned by singleton popup state or component instance.

## Implementation details

- Generalize existing action-popup manager into one shared card-popup manager. Use one ordered entry list for action and card-details entries, with stable entry IDs and entry-specific state. New entries start on top; pointer interaction or keyboard focus moves an existing entry to top without remounting it.
- Keep one entry per card and popup kind. Opening action popup follows current toggle behavior. Opening already-open card-details popup closes it; opening another card adds a second entry instead of replacing first.
- Give card-details entries card internal ID, current path, anchor plus fallback anchor, and their own diff selection. Update matching paths after card rename. Card deletion closes only matching card-details entry. Project change clears all entries; leaving board view closes card-details entries without closing action popups.
- Replace desktop card `ResizablePopover` with shared non-modal `ResizablePopper`. Use card header as drag handle, activate on pointer/focus, resize from all eight edges/corners, constrain popup to viewport, and persist shared desktop card-details size. Keep close, Escape, editor fullscreen, and toolbar behavior.
- Render card-details entries through stable keyed host components. Each entry owns title draft, Markdown history, fullscreen state, delete-dialog state, diff state, open document, and popup-scoped card Markdown data source. Pass that data source through `CardBodyEditor`, `CardPopupToolbarControls`, `CardPropertiesControl`, `CardPropertiesPanel`, `CardCommitDiffPanel`, and `useActiveCard`; keep singleton list-card source behavior unchanged. Dispose popup subscriptions and close its board document when entry closes.
- Use manager's position for one z-index order across action and card-details popups. Nested menus, tooltips, properties popovers, and editor typeahead layers use owning popup's themed overlay layer so they remain above owner without changing global popup order.
- When **View diff** targets card with open details popup, select diff and activate that entry. Otherwise open new card-details entry with worktree diff selected.
- Keep mobile card details full-screen, non-draggable, and non-resizable. Multiple entries may remain open, but only highest stacked full-screen popup is visible and interactive; closing it reveals next entry.
- Add focused tests for shared manager entries and ordering, card host lifetime, independent editor targets and drafts, rename/delete/project/view cleanup, worktree-diff routing, drag/resize activation, persisted size, and mobile behavior. Remove obsolete singleton-popover tests only where behavior intentionally changes.

## Acceptance criteria

- Desktop can keep multiple card-details popups open, including while multiple card action popups remain open.
- Each desktop card-details popup can move by dragging its header and resize from every edge and corner; its saved size is reused on later opens.
- Clicking, focusing, dragging, or resizing any card or action popup brings that popup above every other managed popup. Activation does not close, remount, move, or reset another popup.
- Closing top popup reveals next-highest popup. Closing or deleting one card affects only that card's details popup and editor resources.
- Each open card editor keeps correct card content, title, properties, save status, undo history, diff selection, and local UI state while user edits or activates other popups.
- Card rename keeps matching popup open on new path. Project change clears all managed popups; leaving board view closes card-details popups while preserving action popups.
- Worktree **View diff** opens or activates correct card-details popup and does not replace unrelated card popup.
- Mobile card details retain full-screen layout without drag or resize controls; multiple open entries follow shared stack order, and closing top entry reveals next one.
- Tests cover mixed card/action stacking, multiple independent card editors, cleanup, diff routing, desktop interaction, size persistence, and mobile behavior.
