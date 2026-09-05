---
author:
id: F_313
internalId: 38dda9b3-29d3-4797-9d49-d2e435ccd6f1
title: add dependency edge tools
status: ready
owner:
affects:
agents:
  - design/activity/card__38dda9b3-29d3-4797-9d49-d2e435ccd6f1.json
policy:
after: a19922cd-3580-4417-8906-3b8b73d4f46f
changedFiles:
  - app/src/components/diagram_view/diagram_dependency_edge_button.test.tsx
  - app/src/components/diagram_view/diagram_dependency_edge_button.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/services/diagrams/diagram_edge_drawing_service.test.ts
  - app/src/services/diagrams/diagram_geometry_service.test.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add Dependency and Cycle buttons for dependency diagrams.

## Acceptance criteria

* Both kinds use shared drawing and persisted connection points.
* Dependency direction matches the existing from and to contract.
* Cycle edges retain cycle styling and cycle routing behavior.
* Reconnecting or deleting either kind leaves fan-in and routes correctly derived.
* The buttons appear only for dependency diagrams.

## State and rendering rule

Dependency and cycle edges are stable service-owned objects. Creating one changes edge membership once; reconnecting one assigns its endpoint fields and updates only that route and affected endpoint fan-in. Unrelated edges are never rerouted or rerendered.

## Dependencies

[F\_311](F_311_add_edge_drawing_infrastructure.md).
