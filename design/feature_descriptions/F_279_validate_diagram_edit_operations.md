---
author:
id: F_279
internalId: 2be66ea0-5097-4d45-a94e-d4a7b72331ca
title: validate diagram edit operations
status: ready
owner:
affects:
agents:
  - design/activity/card__2be66ea0-5097-4d45-a94e-d4a7b72331ca.json
policy:
changedFiles:
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_geometry_service.test.ts
  - shared/diagram_data.d.mts
  - shared/diagram_data.mjs
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Prevent editing tools from creating diagram states that the parser or renderer cannot accept.

## Scope

Validate only the proposed operation and its directly affected relationships before assignment. Use service-owned identity indexes and current field values for diagram-type restrictions, references, required labels, grid geometry, edge kinds, cardinalities, and fragment regions. Do not validate an ordinary edit by cloning, serializing, parsing, or traversing the complete diagram. The complete parser remains the load and save boundary. Report operational failures through `dialogService`; do not throw while React renders.

## Acceptance criteria

* Rejected operations leave canonical editable data and its change set unchanged.
* Errors identify the attempted operation and invalid field.
* Validation reuses the diagram contract instead of maintaining conflicting UI-only rules.
* A one-field operation inspects only that field, its owner, and relationships whose validity depends on it.
* Validation emits no state event and causes no component rerender.
* Tests cover invalid references, types, geometry, and required semantic fields.

## Dependencies

[F\_329](F_329_make_diagram_edit_updates_granular.md) and [F\_276](F_276_add_diagram_mutation_operations.md).
