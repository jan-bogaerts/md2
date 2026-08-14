---
author: 
id: F_177
internalId: 6e978222-1b68-4e43-bcbf-2e1efa4f6147
title: allow width change of expanded action popup
status: ready
owner: 
affects:
agents:
  - design/releases/0_3_0/card__6e978222-1b68-4e43-bcbf-2e1efa4f6147.json#conversation=agent-6292b097-968a-4f6a-a7a4-b03e62922c65
  - design/releases/0_3_0/card__6e978222-1b68-4e43-bcbf-2e1efa4f6147.json#conversation=agent-b3a008b7-b0a7-4c85-95b2-6399f343a50e
policy:
after: 2b696eca-93cd-48b1-a237-b3cb9658e1d8
---

When an action popup is fully expanded, you can no longer change it's width. this should still be possible.

## Current state

On desktop, `ActionPopup` owns a local `fullHeight` toggle. `ActionPopupFrame` passes that state to `ResizablePopper`, which fixes the popup to the viewport top, sets its height to `100vh`, preserves its stored width, and keeps its anchored horizontal position within the viewport.

`ResizablePopper` suppresses every resize handle while `fullHeight` is true. The expanded popup therefore keeps its previous width but cannot change it until collapsed. Mobile action popups also use `fullHeight`, but they are forced to `100vw` and intentionally expose neither expansion nor resize controls. File-selector and card-details popups share `ResizablePopper`; their current behavior must remain unchanged.

## implementation details

- Add an explicit `ResizablePopper` option for horizontal resizing in full-height mode. Enable it only for desktop action popups.
- In enabled full-height mode, render accessible left-edge and right-edge resize handles. Do not render top, bottom, or corner handles because height remains fixed to viewport height.
- Reuse existing pointer-resize flow, minimum width, activation, and size persistence. Resizing right edge keeps left edge fixed; resizing left edge keeps right edge fixed and updates detached horizontal position. Clamp width and position so popup remains inside viewport.
- Preserve normal popup height while expanded. Width changes update existing card or project action-popup storage entry, so collapsing restores previous height with new width and reopening restores both values.
- Keep mobile action popups full-width and non-resizable. Do not change dragging, expand/collapse controls, stacking, close behavior, or normal eight-direction desktop resizing.
- Keep file-selector and card-details popup behavior unchanged. Add focused `ResizablePopper` tests for both horizontal edges, viewport/minimum clamping, persistence, and collapse. Update `ActionPopup` tests for desktop expanded handles and unchanged mobile behavior.

## acceptance criteria

- After desktop action popup enters full-height mode, user can change its width from left or right edge.
- Left-edge resizing keeps right edge fixed; right-edge resizing keeps left edge fixed. Popup remains within viewport and never becomes narrower than existing minimum width.
- Horizontal resizing does not change full-height presentation, popup content, selected action, conversation, focus behavior, stack order, or close behavior.
- Collapsing after resize restores pre-expansion height and keeps new width. Closing and reopening same card or project popup restores persisted height and width.
- Normal desktop action popup still resizes from all eight edges and corners and remains draggable.
- Mobile action popup remains `100vw`, uses visible dynamic viewport height, and exposes no resize or expand/collapse controls.
- File-selector and card-details popups retain current resizing, fullscreen, mobile, persistence, and positioning behavior.
- Full-height resize handles have directional accessible labels and use horizontal resize cursors.
