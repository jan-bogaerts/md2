---
author: 
id: F_106
internalId: b0ac8dca-7740-48b1-b5d4-1c1e5750ee39
title: active popup to front
status: design
owner: 
affects:
agents:
  - design/activity/card__b0ac8dca-7740-48b1-b5d4-1c1e5750ee39.json#conversation=agent-5f1da2db-defb-49ac-96ba-9af01b3f450d
policy:
after: 
---

we have a number of popup components used in the cards-view. multiple popups can be open at the same time. but the last opened remains on top, this is annoying. we should bring the active popup to the front. Active is the popup that has keyboard focus or where the user clicks on

## Current state

`CardActionPopupService` keeps one entry per open card action popup, and `CardActionPopupHost` renders them with stable ids. Every `ActionPopup` uses `ResizablePopper`, whose Popper root has the same modal z-index. Portal order therefore leaves the last opened popup above older popups, even after the user focuses or clicks an older one.

## Implementation details

- Make `CardActionPopupService` own popup stack order. A new popup starts at the front; activating an existing entry moves it to the front without changing its id or remounting it.
- Pass stack position and an activation callback through `CardActionPopupHostEntry`, `ActionPopup`, and `ActionPopupContent` to `ResizablePopper`.
- Activate on pointer down anywhere inside popup paper and on captured focus, covering clicks, drag/resize starts, and keyboard focus.
- Give each hosted popup an explicit z-index derived from current stack position. Keep non-hosted `ResizablePopper` behavior unchanged.
- When front popup closes, next-highest open popup becomes front. Closing, project changes, drag, resize, full-height mode, and popup-local state otherwise keep current behavior.
- Add regression tests for stack order in `card_run_button.test.tsx` and activation handling in `resizable_popper.test.tsx`.

## Acceptance criteria

- Newly opened card action popup appears above existing card action popups.
- Clicking, dragging, resizing, or moving keyboard focus into a lower popup brings it above all other card action popups.
- Activating a popup does not close, remount, reposition, or reset any open popup.
- Closing front popup reveals next-highest popup; remaining popups stay usable.
- Background card-view interaction does not change popup order.
- Tests cover initial order, pointer activation, focus activation, and closing front popup.
