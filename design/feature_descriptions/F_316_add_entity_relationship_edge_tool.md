---
author:
id: F_316
internalId: c8d8482b-8abb-44a6-8ee1-1ca4e45e035c
title: add entity relationship edge tool
status: ready
owner:
affects:
agents:
  - design/activity/card__c8d8482b-8abb-44a6-8ee1-1ca4e45e035c.json
policy:
after: bb95c759-589b-43e9-968c-02f83b371438
changedFiles:
  - app/src/components/diagram_view/diagram_entity_relationship_button.test.tsx
  - app/src/components/diagram_view/diagram_entity_relationship_button.tsx
  - app/src/components/diagram_view/diagram_object_details_dialog.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/components/diagram_view/editable_diagram_leaves.test.tsx
  - app/src/services/diagrams/diagram_edge_drawing_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add Relationship for entity diagrams.

## Acceptance criteria

* The button appears only for entity diagrams.
* Drawing creates a relationship between two entity connection points.
* Details edit label and both optional cardinalities using the existing allowed values.
* Cardinality labels follow reconnected or moved endpoints.
* Invalid cardinalities or non-entity endpoints are rejected before mutation.

## State and rendering rule

Relationship label, endpoints, and cardinalities are separate fields on a stable edge object. Changing one assigns that field and rerenders only the relationship leaf and any directly affected endpoint-derived data.

## Dependencies

[F\_311](F_311_add_edge_drawing_infrastructure.md) and [F\_296](F_296_edit_diagram_object_details.md).
