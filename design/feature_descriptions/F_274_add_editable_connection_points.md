---
author:
id: F_274
internalId: cfe002ea-7a48-4c32-bed1-078fae7b5d5c
title: add editable connection points
status: ready
owner:
affects:
agents:
  - design/activity/card__cfe002ea-7a48-4c32-bed1-078fae7b5d5c.json
policy:
changedFiles:
  - app/src/data/data_types.ts
  - app/src/services/config/config_service.service.test.ts
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - shared/diagram_data.d.mts
  - shared/diagram_data.mjs
after: c632a2b7-9a1a-4c98-b42d-79d3c26fa0c8
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Represent edge endpoints as stable connection points on nodes so users can draw and reconnect edges precisely.

## Scope

* Extend the diagram schema with source and target attachment data based on node side and relative offset.
* Convert attachment data into absolute coordinates during layout.
* Preserve existing automatic port selection when attachment data is absent.
* Validate that endpoints reference their edge's `from` and `to` nodes and remain on a node boundary.
* Update serialization, parser tests, layout tests, and diagram-output instructions.

## Acceptance criteria

* A stored connection point follows its node when the node moves or resizes.
* Multiple edges can use distinct points on the same node side.
* Invalid endpoint data fails with a field-specific malformed-diagram error.
* Existing diagrams without explicit connection points render unchanged.

## Dependencies

[F\_273](F_273_define_editable_diagram_contract.md).
