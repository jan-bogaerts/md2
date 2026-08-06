---
author: 
id: F_145
internalId: 451ece87-dccb-44dd-9783-a22c2709a8e2
title: Action popup on mobile
status: ready
owner: 
affects:
agents:
  - design/activity/card__451ece87-dccb-44dd-9783-a22c2709a8e2.json#conversation=agent-89b9e06b-f9e0-4fbc-99ec-6abe6317d858
  - design/activity/card__451ece87-dccb-44dd-9783-a22c2709a8e2.json#conversation=agent-43ada396-b9c4-4498-b39d-1454399d4dc7
policy:
---

On mobile, when an action popup is opened, show it as max screen, like the card popup

## Current state

- Every action popup uses `ResizablePopper` with an initial 400 × 450 size, an anchor position, drag and resize controls, and a stored desktop size.
- The expand control only makes the popup full viewport height; width remains unchanged.
- Mobile card details already use a full-screen layout, but action popups keep their desktop layout and can exceed the usable mobile viewport.

## implementation details

- Detect mobile inside the shared action-popup path with the existing `theme.breakpoints.down('md')` breakpoint. Apply the result to every card, file, folder, and project action popup, including search and project-agent entry points.
- On mobile, render `ResizablePopper` at viewport origin with full viewport width and height, zero margin, zero border radius, and no viewport size limits. Disable dragging, resizing, desktop size persistence, and the expand/collapse control.
- Keep header and bottom controls fixed while the existing content body scrolls when content exceeds available height.
- Keep desktop anchoring, dragging, resizing, saved dimensions, and expand/collapse behavior unchanged.
- Add mobile layout coverage to `action_popup.test.tsx` and keep desktop popup regression coverage. Verify full-screen size, missing resize and expand controls, scrolling content, close behavior, and representative card and project contexts.

## acceptance criteria

- When any action popup opens at the mobile breakpoint, it fills the viewport from its top-left corner without margins or rounded corners.
- Mobile popup cannot be dragged or resized, does not show expand/collapse control, and does not read or overwrite stored desktop popup dimensions.
- Popup header and bottom controls remain visible while its content body scrolls.
- Close, action selection, run controls, and conversation controls remain usable on mobile.
- At desktop widths, popup remains anchored, draggable where enabled, resizable, size-persistent, and vertically expandable.
