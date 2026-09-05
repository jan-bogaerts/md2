---
author:
id: F_310
internalId: cffd0f4a-8cc4-4429-bacc-e08c28c7b233
title: add entity node tool
status: ready
owner:
affects:
agents:
  - design/activity/card__cffd0f4a-8cc4-4429-bacc-e08c28c7b233.json
policy:
branch: f_310_add_entity_node_tool
worktree: 1
changedFiles:
  - app/src/components/diagram_view/diagram_entity_field.tsx
  - app/src/components/diagram_view/diagram_entity_node_button.test.tsx
  - app/src/components/diagram_view/diagram_entity_node_button.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_node_details_editor.tsx
  - app/src/components/diagram_view/diagram_object_details_dialog.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/components/diagram_view/editable_diagram_entity_field.tsx
  - app/src/components/diagram_view/editable_diagram_entity_fields.tsx
  - app/src/components/diagram_view/editable_diagram_leaves.test.tsx
  - app/src/components/diagram_view/editable_diagram_node.tsx
  - app/src/components/diagram_view/use_editable_diagram.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_geometry_service.test.ts
  - app/src/services/diagrams/diagram_geometry_service.ts
  - app/src/services/diagrams/diagram_node_placement_service.test.ts
  - app/src/services/diagrams/diagram_node_placement_service.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add an Entity button for entity diagrams.

## Acceptance criteria

* The tool is available only for entity diagrams.
* Placement creates a valid entity node with an editable field collection.
* Details can add, edit, order, and remove fields and their optional primary/foreign keys and types.
* Height remains explicit after user resizing and otherwise follows existing entity defaults.
* The created entity becomes selected.

## State and rendering rule

The entity leaf subscribes to its own fields. Editing one entity field assigns only that field entry or changes only the owning field-list membership; it does not replace the entity, node collection, or diagram. Only the owning entity leaf and directly affected geometry rerender.

## Dependencies

[F\_302](F_302_add_node_placement_infrastructure.md) and [F\_296](F_296_edit_diagram_object_details.md).
