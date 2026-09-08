---
author: 
id: F_341
internalId: 1c4b8e5f-d13a-4c28-aa5a-b6724f3b6f1b
title: diagram zoom with ctrl scrollwheel
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__1c4b8e5f-d13a-4c28-aa5a-b6724f3b6f1b.json
policy:
---

on the diagram view, we currently support zooming .we should allow the user to zoom with the mouse : when ctrl is pressed, the scroll-wheel should zoom in and out.

## Current state

`Current` is the saved read-only diagram; `New` is the editable copy. Each has its own scroll container, service-owned zoom scale, and lower-left slider. Zoom uses the discrete values in `DIAGRAM_ZOOM_VALUES` from 10% through 250%. A scale change keeps the visible viewport center stable and changes no diagram coordinates or edit state.

Neither scroll container handles wheel input. An unmodified vertical wheel scrolls normally. `Ctrl` plus wheel can therefore reach browser zoom instead of changing the diagram scale.

## implementation details

* Add one shared diagram Ctrl-wheel zoom hook used by `DiagramCurrentViewport` and `DiagramZoomViewport`. Attach a non-passive `wheel` listener to each scroll container so handled events can cancel browser zoom.
* Handle only events where `ctrlKey` is true and `deltaY` is non-zero. Negative `deltaY` selects the next larger value in `DIAGRAM_ZOOM_VALUES`; positive `deltaY` selects the next smaller value. One wheel event moves one supported zoom step.
* Prevent default browser and scroll behavior for every handled Ctrl-wheel event, including events received at minimum or maximum zoom. Do not prevent or change wheel events without `Ctrl`.
* Clamp at 10% and 250%. Reuse each viewport's existing `setViewportScale`; keep Current and New scales independent. Add no zoom state to components.
* Keep existing viewport-center preservation. Ctrl-wheel zoom is centered on the visible viewport, not the pointer position. It changes no diagram coordinates, editable data, selection, dirty state, change set, active tool, or pan gesture.
* Add focused tests for direction, one-step changes, the 10%-to-25% endpoint step, bounds, default prevention, unmodified scrolling, independent Current/New scales, and unchanged center preservation. Run affected viewport tests, app lint, and app typecheck.

## acceptance criteria

* While pointer is over a Current or New diagram, `Ctrl` plus wheel up increases only that diagram's zoom by one supported step; `Ctrl` plus wheel down decreases it by one supported step.
* Ctrl-wheel zoom works in read-only mode and every comparison layout. Current and New retain independent scales.
* Zoom stops at 10% and 250%. Further Ctrl-wheel input at either bound leaves scale unchanged and does not zoom browser or scroll page.
* Wheel input without `Ctrl` keeps normal scrolling and never changes diagram zoom.
* Visible viewport center stays stable where scroll bounds allow. Pointer position is not used as zoom anchor.
* Ctrl-wheel zoom changes no diagram coordinates, editable data, selection, dirty state, change set, active tool, or pan state. Existing slider and pointer interactions remain usable.
* Focused Ctrl-wheel, viewport, and zoom tests pass; app lint and typecheck pass.
