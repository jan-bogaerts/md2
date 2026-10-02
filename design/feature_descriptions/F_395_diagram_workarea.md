---
author: 
id: F_395
internalId: e4aa0a7e-bcfd-4c1c-a665-9d9a2cf52918
title: Diagram workarea
status: ready
owner: 
affects:
agents:
  - design/activity/card__e4aa0a7e-bcfd-4c1c-a665-9d9a2cf52918.json
policy:
changedFiles:
  - app/src/components/diagram_view/comparison/diagram_comparison.test.tsx
  - app/src/components/diagram_view/comparison/tabbed_diagram_comparison.test.tsx
  - app/src/components/diagram_view/comparison/vertical_diagram_comparison.test.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/editing/editable_diagram.tsx
  - app/src/components/diagram_view/surface/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/surface/diagram_zoom_viewport.tsx
  - app/src/services/diagrams/diagram_geometry_service.test.ts
  - app/src/services/diagrams/diagram_geometry_service.ts
after: fe5a5bae-110a-49e6-ae74-60ed197c5c9b
---

When we show a diagram in edit mode we should always show both hor and ver scrollbars. The workarea should also always be a little bigger then the available space, so user can always scroll and extend area by dragging items.

## Current state

`New` is editable diagram. `DiagramZoomViewport` renders it inside scroll container with `overflow: auto`; `EditableDiagramSurface` takes width and height from `DiagramGeometryService`. `diagram_layout.ts` sizes surface from diagram objects plus 40 px padding, and geometry service updates bounds when objects move. Small diagram can therefore leave no scroll range. `Current` has separate read-only viewport. New uses same pane in standalone edit mode and all comparison layouts.

## implementation details

* *Workarea* means interactive New drawing surface. *Available space* means visible New scroll container after padding. Keep at least 64 CSS px of scroll range in both axes, including when diagram is empty, pane resizes, or zoom changes.
* Set both New scroll axes to `scroll` so native horizontal and vertical scrollbars are requested even when content is small. Keep change in `DiagramZoomViewport`; Current keeps existing scrolling behavior.
* Observe New viewport size and derive minimum workarea width and height after accounting for zoom, scroll-container padding, and editor header. Use larger of those minimums and existing object-derived bounds. Extend `EditableDiagramSurface` itself so added space accepts existing pointer interactions; do not add blank space only around it.
* Keep viewport-dependent minimum size in service-owned view geometry, separate from persisted `DiagramData`. When dragged object exceeds current bounds, existing geometry updates extend surface; moving it back or resizing pane recomputes minimum. Preserve origin compensation, pointer-to-diagram coordinates, pan, and zoom-center behavior.
* Add focused viewport and geometry tests for empty and small diagrams, both axes, pane resize, zoom, and dragging objects beyond current bounds. Check standalone edit and comparison layouts; leave Current unchanged.

## acceptance criteria

1. New requests both native scrollbars throughout edit mode, including empty diagrams and each comparison layout. At every supported zoom and pane size, users can scroll at least 64 CSS px horizontally and vertically.
2. Added workarea accepts selection, placement, and drawing input. Dragging node or group outward grows workarea beyond its previous bound; user can then scroll to that position.
3. Resizing pane or changing zoom preserves valid minimum workarea without changing diagram object coordinates, edit dirty state, change set, or saved JSON.
4. Existing New pan, selection, pointer coordinates, origin compensation, and zoom-center behavior remain correct. Current diagram scrolling remains unchanged.
