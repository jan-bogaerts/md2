---
author: 
id: B_110
internalId: 12b91511-c445-404c-afcb-bdaf300ef50b
title: Mobile popup height
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__12b91511-c445-404c-afcb-bdaf300ef50b.json#conversation=agent-478a6c11-661d-4474-9e99-1f39d2d74fc9
policy:
branch: b_110_mobile_popup_height
worktree: 1
---

On mobile borwser, the action popup goes to full height, as if the top bar of the browser is hidden, but it isnt which results in the bottom of the input not visible.

By scrolling we can sometimes hide the browser bar, but it is annoying. Can we make the height correspond to the actual available height

Mobile card-body popups have the same problem and need the same correction.

## Current state

Below the `md` breakpoint, `ActionPopupFrame` disables dragging and resizing, places the action popup at the viewport origin, and forces its height to `100vh`. `CardBodyPopover` uses the same mobile placement and height. Mobile browsers can calculate `100vh` from the larger viewport available when browser chrome is hidden. While the browser toolbar remains visible, both popups therefore extend below the visible viewport. This hides the action input footer and the bottom of card details.

Both popup contents already use flex children with `minHeight: 0` and scrollable bodies, so internal scrolling works once each outer popup has the correct height. `ResizablePopper` also uses `100vh` for its general full-height mode. Changing that shared behavior would affect desktop expanded action popups and unrelated call sites. Both affected components already provide mobile `!important` height overrides, so the fix can remain local. `NewCardDialog` already uses `100dvh`; dynamic viewport height means the currently visible viewport height, updated when mobile browser chrome appears or disappears.

## Implementation details

* In `ActionPopupFrame`, change only the mobile height override from `100vh` to `100dvh`. Keep full width, fixed top-left placement, disabled drag and resize, desktop full-height behavior, and stored desktop sizes unchanged.
* In `CardBodyPopover`, change only the mobile height override from `100vh` to `100dvh`. Keep its desktop normal and fullscreen heights, mobile stacking, full width, fixed placement, disabled mobile drag and resize, and stored desktop size unchanged.
* Do not change `ResizablePopper`: its general full-height behavior and other call sites keep current behavior. Do not add safe-area footer padding; Android system-navigation overlap is tracked separately by `F_126`.
* Update focused `ActionPopup` tests to require `100dvh` for mobile card and project action popups. Add focused `CardBodyPopover` coverage requiring `100dvh` in mobile layout. Keep existing assertions for scrolling, visible controls, placement, popup stacking, resize handles, and size persistence.

## Acceptance criteria

* With the mobile browser toolbar visible, action and card-body popups end at the visible viewport bottom. Action input footer and bottom card details remain reachable without first hiding the toolbar.
* When browser chrome appears, disappears, or changes size, each open affected popup follows the dynamic viewport height without reopening.
* Mobile card and project action popups retain full-width, top-left placement; their content scrolls while toolbar and footer remain inside the popup.
* Mobile card-body popups retain full-width, top-left placement and current stacking; card content scrolls within the visible popup.
* Portrait and landscape layouts keep Close, action selection, conversation controls, and applicable Send or Run controls usable.
* Desktop action and card-body popup sizing, fullscreen or expand and collapse behavior, dragging, resizing, and persisted sizes remain unchanged.
* No extra safe-area padding is introduced by this feature.
