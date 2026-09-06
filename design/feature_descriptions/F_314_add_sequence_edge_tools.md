---
author:
id: F_314
internalId: a9a843a2-367c-42ec-b9ca-7d990faf13ff
title: add sequence edge tools
status: ready
owner:
affects:
agents:
  - design/activity/card__a9a843a2-367c-42ec-b9ca-7d990faf13ff.json
policy:
changedFiles:
  - app/src/components/diagram_view/diagram_comparison.tsx
  - app/src/components/diagram_view/diagram_edge_details_editor.tsx
  - app/src/components/diagram_view/diagram_object_details_dialog.test.tsx
  - app/src/components/diagram_view/diagram_sequence_edge_button.test.tsx
  - app/src/components/diagram_view/diagram_sequence_edge_button.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/editable_diagram_lifeline.tsx
  - app/src/services/diagrams/diagram_edge_drawing_service.test.ts
  - app/src/services/diagrams/diagram_edge_drawing_service.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_geometry_service.test.ts
  - app/src/services/diagrams/diagram_geometry_service.ts
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
after: 38dda9b3-29d3-4797-9d49-d2e435ccd6f1
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add Call, Return, Async, and Success buttons for sequence diagrams.

## Scope

Shared drawing chooses participants; completion also chooses or inserts the message row required by deterministic sequence layout.

## Acceptance criteria

* The four buttons create their existing semantic kinds and visual styles.
* Message order is deterministic and persists after reload.
* Calls and matching returns or success messages update derived activation bars.
* Fragment references remain valid when rows are inserted, moved, or deleted.
* Sequence edge labels and endpoints are editable.

## State and rendering rule

A new message changes edge membership once. Row insertion updates only the new message and later sequence view objects whose row-derived geometry shifts. Earlier messages, participants without changed derived data, diagram roots, and unrelated collections retain their snapshots.

## Dependencies

[F\_311](F_311_add_edge_drawing_infrastructure.md) and [F\_278](F_278_make_diagram_layout_compatible_with_editing.md).
