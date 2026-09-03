---
author: 
id: F_271
internalId: 6ea2e797-b87b-4246-974a-d45ddc3fefc1
title: diagrams add legend
status: ready
owner: 
affects:
agents:
  - design/activity/card__6ea2e797-b87b-4246-974a-d45ddc3fefc1.json
policy:
after: 7037a625-d650-4574-b1d5-874d90ba82a4
changedFiles:
  - app/src/components/diagram_view/diagram.tsx
  - app/src/components/diagram_view/diagram_edge.tsx
  - app/src/components/diagram_view/diagram_edge_style.node.test.ts
  - app/src/components/diagram_view/diagram_edge_style.ts
  - app/src/components/diagram_view/diagram_legend.test.tsx
  - app/src/components/diagram_view/diagram_legend.tsx
  - app/src/components/diagram_view/diagram_legend_connection_sample.tsx
  - app/src/components/diagram_view/diagram_legend_entries.node.test.ts
  - app/src/components/diagram_view/diagram_legend_entries.ts
  - app/src/components/diagram_view/diagram_legend_position.ts
  - app/src/components/diagram_view/diagram_renderer.test.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/data/data_types.ts
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_data.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - desktop/src/actions/action/action_scheduler_service.js
---
add a legend to the diagrams with the different nodes and connections.

legend needs to be collapsible and movable

It needs to be above the diagram and not follow scroll of diagram, so legend is in same plane as the diagram container. This way it can always stay in view

## Current state

`Diagram` renders `DiagramLegend` after the diagram surface. Because both sit inside the scrolling `Active diagram` box in `DiagramView`, the legend starts below the full diagram and moves out of view with horizontal or vertical diagram scrolling.

Legend data is optional `meta.legend: [{ label, role }]`. `diagram_data.ts` validates only node roles; default footer text in `app/src/data/data_types.ts` and its duplicate in `desktop/src/actions/action/action_scheduler_service.js` ask agents for optional role entries. `diagram_legend.tsx` renders only role-coloured node swatches. Connection kinds are absent. Legend has no header, collapse control, drag handling, or position state.

Node appearance comes from shared `diagramRoleStyle`. Connection appearance is computed inside `DiagramEdge`: `async`, `cycle`, and `return` use dashed lines; `cycle` and `success` use accent colour; `async` uses an open arrowhead while other kinds use a filled arrowhead.

## Implementation details

Derive legend content from active diagram, not `meta.legend`. Include each node `role` and edge `kind` used by diagram once, ordered by first appearance. Display canonical role and kind names as labels. This guarantees complete legend for existing and new diagrams without agent-authored legend data. Remove `DiagramLegendItem`, `DiagramMeta.legend`, its parser, legend instructions from both default footer copies, and related test fixtures. Existing JSON containing `meta.legend` still loads because parser ignores unknown fields; supplied labels no longer control display.

Extract connection visual rules into one pure `diagram_edge_style.ts` helper. Current `DiagramEdge` call site keeps existing line, colour, dash, and arrowhead behaviour. New `DiagramLegend` call site uses same rules for connection samples. `diagramRoleStyle` remains shared by `DiagramNode` and node legend samples.

Move legend ownership from `Diagram` to `DiagramView`. Make active-diagram region a positioned, non-scrolling container containing two siblings: inner diagram scroller and absolutely positioned legend panel. Here, **same plane** means legend overlays viewport container rather than belonging to scrollable diagram content. Give panel theme-backed paper surface, divider border, floating elevation, and initial top-right position inside viewport.

Add legend view state to `DiagramViewService`: collapsed state and optional position relative to active-diagram viewport. Expose focused methods to collapse, expand, and move it. State survives diagram navigation within bound project, then resets when project is cleared or changed; it is not persisted to repository or browser storage.

Use legend header as drag handle for mouse, touch, and pen. Pointer capture keeps drag active outside header. Clamp panel inside active-diagram viewport during drag, expansion, and viewport resize. Collapse button must not start drag. Suppress click caused by completed drag. Collapsed panel keeps header and expand control visible; expanded body may scroll when entries exceed available height.

Use labelled icon buttons with tooltips for collapse and expand. Panel remains above nodes and connections but below menus and action popups. Diagram selection, layout geometry, scrolling, breadcrumbs, and action popup behaviour remain unchanged.

Add focused tests for derived unique entries and order, shared connection samples, collapse/expand, pointer dragging and clamping, resize clamping, click-after-drag suppression, scroll independence, service state reset, and keyboard-accessible controls. Run affected app tests and app lint.

## Acceptance criteria

1. Every loaded diagram shows one legend entry for each node role and connection kind present, with duplicates removed in first-appearance order.
2. Node samples match node role styling. Connection samples match rendered connection colour, solid or dashed line, and open or filled arrowhead.
3. Legend overlays top-right of active-diagram viewport initially. Horizontal and vertical diagram scrolling never moves it.
4. User can move legend by dragging header with mouse, touch, or pen. Panel remains fully inside active-diagram viewport.
5. Dragging does not collapse, expand, select diagram item, or open action menu. Collapse and expand controls do not initiate drag.
6. User can collapse legend to header and expand it again using accessible icon controls. Collapsed and moved state survives navigation between diagrams in same project session.
7. Project change or Diagram view service clear resets legend to expanded top-right position. No legend position or collapsed state is written to project files or browser storage.
8. Resizing viewport or expanding near an edge reclamps legend so header and controls remain reachable. Oversized expanded content scrolls inside legend body.
9. Diagram title, description, nodes, connections, layout dimensions, diagram scrolling, selection, breadcrumbs, and root or child action popups behave as before.
10. A diagram containing old `meta.legend` data still loads; visible legend is derived from its nodes and edges, not old entries.
