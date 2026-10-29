---
author: 
id: F_450
internalId: 5ee8aecb-2f88-4c84-ad76-2b7126529159
title: ctrl tab in dashboard view
status: ready
owner: 
affects:
agents:
  - design/activity/card__5ee8aecb-2f88-4c84-ad76-2b7126529159.json
policy:
branch: f_450_ctrl_tab_in_dashboard_view
worktree: 1
changedFiles:
  - app/src/components/resizable_popper.test.tsx
  - app/src/services/card_popup_service.test.ts
  - app/src/services/shortcuts/cards_keyboard_shortcut_service.node.test.ts
  - app/src/services/shortcuts/cards_keyboard_shortcut_service.ts
---

ctrl tab in dashboard view should switch between topmost popup.

## Current state

* "Dashboard view" is the cards workspace view (`WorkspaceViewMode` `cards`, see J_63).
* Popup stack: `CardPopupService` (`app/src/services/card_popup_service.ts`) owns an ordered `entries` list of three kinds: `action` (rendered by `CardActionPopupHost`), `card-details` (`CardBodyPopover`), and `sequence` (`CardSequenceDialog`). The last entry is the topmost popup; `stackPosition` (list index) sets the z-index in `ResizablePopper`. In cards view every entry is visible; on mobile width only the top entry is visible.
* `activate(id)` moves one entry to the end of the list and dispatches `changed`. It does not move keyboard focus. Clicking or focusing a popup calls `activate` through `ResizablePopper` `onActivate` (`onPointerDownCapture`, `onFocusCapture`).
* Focus: `ResizablePopper` focuses its paper (`role="dialog"`, `tabIndex={-1}`) only once, on first mount (`focusOnMountRef`, `setPaperElement`). No way exists to focus an already mounted popup from outside.
* Keyboard: `KeyboardShortcutService` routes keys to the global service, then the active view service. `cardsKeyboardShortcutService` (`app/src/services/shortcuts/cards_keyboard_shortcut_service.ts`) is a stub that handles nothing. `TextKeyboardShortcutService` already maps Ctrl+Tab and Ctrl+Shift+Tab (`NEXT_LIST_TAB_SHORTCUT`, `PREVIOUS_LIST_TAB_SHORTCUT` in `list_tab_shortcuts.ts`) to next and previous open document.
* No popup component handles Ctrl+Tab itself, so the key reaches the window listener.

## implementation details

* Behavior: in cards view, Ctrl+Tab cycles forward through the popup stack: the bottom-most popup moves to the top. Ctrl+Shift+Tab cycles backward: the top popup moves to the bottom. Repeated presses visit every popup. After each cycle, keyboard focus moves into the new top popup.
* `CardPopupService`:
  * New method `cycle(offset: 1 | -1)`. With fewer than two entries, return `false`. Forward: move `entries[0]` to the end. Backward: move the last entry to the front. Call `setEntries`, then dispatch a focus request for the new top entry, then return `true`.
  * Focus request is a granular event per entry: type `focusRequested:<entryId>` (constant prefix in the module). Order matters: entries update first, focus request second.
  * New exported function `subscribeCardPopupFocusRequest(entryId, listener)` next to `subscribeCardPopups`; returns an unsubscribe function.
* `CardsKeyboardShortcutService`: replace the stub object with a class like `TextKeyboardShortcutService`, with dependency `{ popups: CardPopupService }`. `handleKeyDown`: on `NEXT_LIST_TAB_SHORTCUT` return `popups.cycle(1)`; on `PREVIOUS_LIST_TAB_SHORTCUT` return `popups.cycle(-1)`; else `false`. Singleton passes `cardPopupService`. Only call site: `viewServices` in `keyboard_shortcut_service.ts` (unchanged import name).
* `ResizablePopper`: new optional prop `subscribeFocusRequest?: (listener: () => void) => () => void`. An effect subscribes when the prop is set. On request: if `paperRef.current` exists, focus it; else set `focusOnMountRef.current = true`, so the paper focuses when it mounts (mobile: new top popup opens only after the reorder renders). Other `ResizablePopper` users (search panel, file search menu, diagram popups) pass nothing; unchanged.
* Pass the subscription from each card popup owner, built with `useCallback` on `entry.id`:
  * `CardActionPopupHostEntry` to `ActionPopup` (new optional prop), into `ActionPopupContentProps`, then `ActionPopupFrame` to `ResizablePopper`. Diagram action popups pass nothing.
  * `CardBodyPopoverEntry` to its `ResizablePopper`.
  * `CardSequenceDialog` to its `ResizablePopper` (only when `entry` exists).
* Focus side effect: focusing the new top paper fires `onFocusCapture`, which calls `activate` on the entry that is already top; no-op, no extra `changed` event.
* Edge cases:
  * Zero or one popup: `cycle` returns `false`; key is not handled; nothing changes.
  * Other views: text view keeps its Ctrl+Tab document switching; diagrams and stats views unchanged (cards service not active there).
  * Focus inside a text field of the old top popup: Ctrl+Tab still cycles; focus leaves the field.
  * Modal MUI dialog open above popups (delete card, affects editor): popups still reorder beneath; the dialog focus trap keeps focus in the dialog.
* Tests:
  * `card_popup_service.test.ts`: forward and backward cycle order with three entries; focus request fires for the new top entry only, after `changed`; fewer than two entries returns `false` and dispatches nothing.
  * New `cards_keyboard_shortcut_service.node.test.ts` (popup service stub): Ctrl+Tab calls `cycle(1)`, Ctrl+Shift+Tab calls `cycle(-1)`, return value passes through; other keys return `false`.
  * `resizable_popper.test.tsx`: focus request focuses a mounted paper; request while closed focuses the paper after open.
  * Run those files directly and `npm run lint` in `app/`.

## acceptance criteria

1. In cards view with two or more popups open (any mix of action, card details, sequence), Ctrl+Tab brings the bottom-most popup to the top.
2. Repeated Ctrl+Tab visits every open popup in turn and returns to the first after a full cycle.
3. Ctrl+Shift+Tab cycles in the opposite direction: the top popup moves to the bottom.
4. After each Ctrl+Tab or Ctrl+Shift+Tab, keyboard focus is inside the new top popup, also on mobile width where only the top popup shows.
5. With zero or one popup, Ctrl+Tab changes nothing.
6. Ctrl+Tab in text view still switches open documents; diagrams and stats views are unchanged.
7. Ctrl+Tab handling lives in `CardsKeyboardShortcutService` and `CardPopupService`; no shortcut registration in `.tsx` files.