---
author:
id: F_311
internalId: ab22473c-bea7-4d12-aced-6628ef5c50f8
title: add edge drawing infrastructure
status: ready
owner:
affects:
agents:
  - design/activity/card__ab22473c-bea7-4d12-aced-6628ef5c50f8.json
policy:
branch: f_311_add_edge_drawing_infrastructure
worktree: 2
changedFiles:
  - app/src/components/diagram_view/diagram_comparison.tsx
  - app/src/components/diagram_view/diagram_edge_drawing_preview.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/services/diagrams/diagram_edge_drawing_service.test.ts
  - app/src/services/diagrams/diagram_edge_drawing_service.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Provide shared source-to-target drawing behavior for every edge tool.

## Scope

Activate an edge kind, choose a source node connection point, preview an orthogonal route, choose a target connection point, validate, create the edge, select it, and return to Select. Escape cancels incomplete drawing.

## Acceptance criteria

* Edges are drawn between nodes; they are not free-standing surface objects.
* Source and target connection points use the persisted endpoint contract.
* Self-connections are accepted only where existing diagram semantics permit them.
* An invalid target creates nothing and keeps the gesture recoverable.
* Shared preview and completion behavior works through scroll and zoom.

## State and rendering rule

Preview route is transient service-owned view data scoped to the drawing gesture. Completion adds one stable edge and changes the edge ID-list snapshot once. Existing edge objects and leaves remain unchanged; only endpoint fan-in fields that actually change receive scoped events.

## Dependencies

[F\_274](F_274_add_editable_connection_points.md), [F\_286](F_286_manage_active_diagram_tool.md), and [F\_289](F_289_add_diagram_coordinate_conversion.md).
