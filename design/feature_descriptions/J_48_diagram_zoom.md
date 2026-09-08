---
author: 
id: J_48
internalId: 3e78e609-b7b9-496d-bc72-0826743d5d65
title: diagram zoom
status: ready
owner: 
affects:
agents:
  - design/activity/card__3e78e609-b7b9-496d-bc72-0826743d5d65.json
policy:
changedFiles:
  - app/src/components/diagram_view/diagram_comparison.test.tsx
  - app/src/components/diagram_view/diagram_comparison.tsx
  - app/src/components/diagram_view/diagram_current_viewport.test.tsx
  - app/src/components/diagram_view/diagram_current_viewport.tsx
  - app/src/components/diagram_view/diagram_editor_rendering.test.tsx
  - app/src/components/diagram_view/diagram_new_pane.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/diagram_view/diagram_zoom_in_button.tsx
  - app/src/components/diagram_view/diagram_zoom_out_button.tsx
  - app/src/components/diagram_view/diagram_zoom_slider.test.tsx
  - app/src/components/diagram_view/diagram_zoom_slider.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.test.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.tsx
  - app/src/components/diagram_view/use_preserve_diagram_zoom_center.ts
  - app/src/components/diagram_view/vertical_diagram_comparison.test.tsx
  - app/src/components/diagram_view/vertical_diagram_comparison.tsx
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - app/src/services/diagrams/diagram_zoom.ts
---

we already have a diagram zoom for the editable part of the diagram. we don't yet allow zooming for the non-editable (current-state) version of the diagram. this is annoying. also, the zoom in\&out buttons are not convenient.

we need to refactor the zoom feature:

* allow for both editable as non-editable version. when both are shown, each gets it's own zoom
* zooming is done with a horizontal slider, put slider floating in lower left corner of the diagram

## Current state

`Current` means the saved read-only diagram; `New` means the editable copy. New alone supports zoom: `DiagramEditSessionService` owns one scale from 50% through 200% in 25-percentage-point steps, and `DiagramZoomViewport` applies it without changing diagram coordinates. Zoom In and Zoom Out buttons live in the floating New toolbox. Current renders directly through `DiagramRenderer`, so it has no scale state or zoom control. During comparison, Current and New use separate scroll containers, but only New can zoom.

## implementation details

* Replace Zoom In and Zoom Out toolbox buttons with one reusable horizontal MUI slider floating above the lower-left corner of each diagram viewport. Keep it outside scrolling content so scrolling or scaling does not move the control. Give it a theme-based floating surface, an accessible name identifying Current or New, and percentage value text.
* Use 10% minimum, 250% maximum, 100% default, and existing 25-percentage-point steps. Treat 10% as an explicit endpoint below 25%. Slider input sets scale directly; keyboard input uses the same values.
* Keep Current and New scale as separate service-owned primitives. `DiagramViewService` owns Current scale and publishes a granular scale event; `DiagramEditSessionService` continues to own New scale. Slider and matching viewport subscribe with `useSyncExternalStore`; diagram, comparison, and toolbox roots do not subscribe to scale.
* Reset Current to 100% when active saved diagram changes. Reset New to 100% when an edit session starts or ends, as today. Preserve both values when comparison layout or active comparison tab changes.
* Apply same zoomed-surface and center-preserving scroll calculation to Current and New. Scaling remains visual only: positioned data, editable model data, selection, and change set remain unchanged. New pointer coordinate conversion continues using New scale only.
* Refactor repeated Current panes in horizontal, vertical, and tabbed comparison layouts to use one Current viewport component. Use same component for non-edit mode so Current behavior stays consistent.
* Remove obsolete zoom button components and their toolbox wiring. Add focused service and component tests for direct slider changes, keyboard use, bounds, resets, independent scales, center preservation, comparison layouts, read-only mode, and unchanged pointer hit testing in New.

## acceptance criteria

* Every visible Current or New diagram has one horizontal zoom slider floating in its lower-left corner; no Zoom In or Zoom Out toolbox buttons remain.
* Current can zoom in normal read-only mode and in every comparison layout.
* When Current and New are both shown, changing one slider changes only its own viewport. Each scale remains unchanged when user switches comparison layout or tab.
* Each slider ranges from 10% through 250%, starts at 100%, moves in 25-percentage-point steps except for the 10% endpoint, supports keyboard operation, and exposes diagram identity plus current percentage to assistive technology.
* Navigating to another saved diagram resets Current to 100%. Starting or ending an edit session resets New to 100%.
* Zoom keeps visible viewport center stable where available and never changes diagram coordinates, editable data, selection, dirty state, or change set.
* Selection and Current item activation remain usable at every scale. New selection, placement, edge and group drawing, moving, and resizing remain accurate at every scale.
* Focused diagram zoom, view, comparison, toolbox, and edit-session tests pass; app lint passes.
