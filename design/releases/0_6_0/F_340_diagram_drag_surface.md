---
author: 
id: F_340
internalId: 5fdacfce-a360-41f7-a964-343f37edd94e
title: diagram drag surface
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__5fdacfce-a360-41f7-a964-343f37edd94e.json
policy:
changedFiles:
  - app/patch_selection_test.py
  - app/patch_toolbox_test.py
  - app/patch_zoom_tests.py
  - app/patch_zoom_viewport.py
  - app/src/components/diagram_view/use_diagram_surface_pan.test.tsx
  - app/src/components/diagram_view/use_diagram_surface_pan.ts
after: 6a4ede44-a6e7-44d0-afdc-3230b6595822
---
user should be able to drag the diagram surface around both in editable and non-editable diagrams. this should move the scroll position.

## Current state

`Current` means the saved read-only diagram; `New` means the editable copy shown during an edit session. Neither one can be panned, where "pan" means dragging the visible content so the scroll container moves, without changing any diagram coordinate.

`DiagramCurrentViewport` renders Current inside a scroll container (`overflow: auto`) and installs no pointer handlers, so scrolling is only possible through the wheel, the scrollbars, or the keyboard. Clicks on a node, edge, or group open the item menu.

`DiagramZoomViewport` owns every New pointer gesture: node placement, edge drawing, group drawing, moving, and resizing. A left-drag that starts on empty New background is already taken: `EditableDiagramSurface` begins a rubber-band rectangle selection there, but only while the active persistent tool is `select`. `DiagramEditSessionService` owns the persistent tool (`select`, `group`, `node:*`, `edge:*`) and the transient gesture (`placement`, `edge`, `group`, `move`, `resize`), and it cancels the transient gesture on Escape and on tool changes.

Both viewports apply zoom as a visual `zoom` scale on an inner surface, and `usePreserveDiagramZoomCenter` writes scroll offsets directly on the scroll container when the scale changes.

## implementation details

* Add a persistent `pan` tool to `DiagramPersistentTool` and a `pan` transient gesture to `DiagramTransientGesture` in `DiagramEditSessionService`. Add one `DiagramToolboxToolButton` for it in the toolbox `Edit` section next to `Select`, so New pan is an explicit mode the user switches into and out of.
* Extract the drag itself into one shared hook, for example `use_diagram_surface_pan.ts`, used by both viewports. On pointer down it records the client point plus the scroll container's `scrollLeft` and `scrollTop`; on pointer move it writes `start - delta` back onto those two properties directly on the DOM element. Deltas are viewport pixels, so no diagram-coordinate conversion and no zoom scale enter the calculation.
* Keep pan out of React state and out of service state. The hook must never trigger a rerender of the diagram, its nodes, or the legend, because a pan repaints far more often than a legend move (see B_227).
* In New, handle pan in `DiagramZoomViewport` pointer handlers ahead of the resize, move, drawing, and placement branches, gated on the active tool being `pan` and on the primary left button. Report the drag through `session.beginTransientGesture('pan')` and `completeTransientGesture()`, so the existing Escape handling, `cancelActiveInteraction`, and `handleTransientGestureChanged` paths already cover it. `EditableDiagramSurface` needs no change: its rubber-band start already returns early unless the active tool is `select`.
* In Current, add pointer handlers to the `DiagramCurrentViewport` scroll container. Start a pan only when the primary left button goes down on empty background, meaning the event target has no `[data-diagram-id]` ancestor. Current has no edit session, so gesture state stays in refs inside the hook.
* Cancelling a pan restores the scroll offsets recorded at pointer down. Cancellation means Escape, `pointercancel`, or `lostpointercapture` in New, and Escape or `pointercancel` in Current.
* Suppress the click that follows a pan once the pointer moved past a small threshold (3 pixels, the threshold the legend drag uses), so a pan that starts on Current background never clears or opens anything, and a short click still behaves as before.
* Show `grab` and `grabbing` cursors on the scroll container while pan is available and while a pan runs. Set them on the container only, never on diagram children.
* Handle the primary pointer only, and do not call `preventDefault` for touch pointers in Current, so native touch scrolling keeps working there.
* Pan changes no diagram data: positioned data, editable model data, selection, dirty state, and the change set stay untouched, and zoom scale stays untouched.
* Add focused tests for: pan in Current and in New, the empty-background restriction in Current, no rubber-band selection while the pan tool is active, click suppression after a drag, restore-on-cancel, pan being unaffected by zoom scale, and the toolbox pan button toggling the tool.

## acceptance criteria

* In the read-only Current diagram, dragging from empty diagram background with the left button scrolls the diagram content with the pointer, in both axes, in normal read-only mode and in every comparison layout.
* In the Current diagram, a drag that starts on a node, edge, or group does nothing, and a click on those items still opens the item menu.
* The New toolbox `Edit` section offers a `Pan` tool next to `Select`. While `Pan` is active, dragging anywhere in the New viewport scrolls it, and no rubber-band selection, move, resize, or drawing starts.
* Switching back to `Select` restores the previous New behaviour, including rubber-band selection from empty background.
* Escape, or a cancelled pointer, during a pan returns the scroll position to where the drag started.
* A pan that moved more than the drag threshold does not produce a click: nothing gets selected, cleared, or opened when the pointer is released.
* Panning changes no diagram coordinates, no editable data, no selection, no dirty state, no change set, and no zoom scale, and works the same at every zoom level.
* Panning does not rerender the diagram, its objects, or the legend.
* Focused diagram viewport, toolbox, edit-session, and pan-hook tests pass; app lint and typecheck pass.
