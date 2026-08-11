---
author: 
id: B_110
internalId: 12b91511-c445-404c-afcb-bdaf300ef50b
title: Mobile action popup height
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__12b91511-c445-404c-afcb-bdaf300ef50b.json#conversation=agent-478a6c11-661d-4474-9e99-1f39d2d74fc9
policy:
---

On mobile borwser, the action popup goes to full height, as if the top bar of the browser is hidden, but it isnt which results in the bottom of the input not visible.

By scrolling we can sometimes hide the browser bar, but it is annoying. Can we make the height correspond to the actual available height

## Current state

Below the `md` breakpoint, `ActionPopupFrame` disables dragging and resizing, places the popup at the viewport origin, and forces its height to `100vh`. Mobile browsers can calculate `100vh` from the larger viewport available when browser chrome is hidden. While the browser toolbar remains visible, the popup therefore extends below the visible viewport and hides the input footer. The popup body already uses `minHeight: 0` and `overflow: auto`, so internal scrolling works once the outer popup has the correct height.

`ResizablePopper` also uses `100vh` for its general full-height mode. Changing that shared behavior would affect desktop expanded action popups and mobile card-body popups. Only the action popup's mobile override needs different behavior. `NewCardDialog` already uses `100dvh`; dynamic viewport height means the currently visible viewport height, updated when mobile browser chrome appears or disappears.

## Implementation details

* In `ActionPopupFrame`, change only the mobile height override from `100vh` to `100dvh`. Keep full width, fixed top-left placement, disabled drag and resize, desktop full-height behavior, and stored desktop sizes unchanged.
* Do not change `ResizablePopper`: its other call sites keep their current behavior. Do not add safe-area footer padding; Android system-navigation overlap is tracked separately by `F_126`.
* Update the focused `ActionPopup` test to require `100dvh` for mobile card and project popups. Keep existing assertions for scrollable content, visible controls, placement, resize handles, and size persistence.

## Acceptance criteria

* With the mobile browser toolbar visible, the action popup ends at the visible viewport bottom and its input footer remains reachable without first hiding the toolbar.
* When browser chrome appears, disappears, or changes size, the open action popup follows the dynamic viewport height without reopening.
* Mobile card and project action popups retain full-width, top-left placement; their content scrolls while toolbar and footer remain inside the popup.
* Portrait and landscape layouts keep Close, action selection, conversation controls, and applicable Send or Run controls usable.
* Desktop popup sizing, expand and collapse behavior, dragging, resizing, and persisted sizes remain unchanged.
* No extra safe-area padding is introduced by this feature.
