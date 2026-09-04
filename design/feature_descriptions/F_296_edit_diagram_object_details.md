---
author:
id: F_296
internalId: 62bae796-a019-452e-bc44-8d2a62318b48
title: edit diagram object details
status: ready
owner:
affects:
agents:
  - design/activity/card__62bae796-a019-452e-bc44-8d2a62318b48.json
policy:
after: f24dc638-db21-4d13-b5ec-bf173913a69b
branch: f_296_edit_diagram_object_details
worktree: 2
changedFiles:
  - app/src/components/diagram_view/diagram_edge.tsx
  - app/src/components/diagram_view/diagram_edge_details_editor.tsx
  - app/src/components/diagram_view/diagram_group.tsx
  - app/src/components/diagram_view/diagram_group_details_editor.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_node_details_editor.tsx
  - app/src/components/diagram_view/diagram_object_details_dialog.test.tsx
  - app/src/components/diagram_view/diagram_object_details_dialog.tsx
  - app/src/components/diagram_view/diagram_object_details_service.test.ts
  - app/src/components/diagram_view/diagram_object_details_service.ts
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/components/diagram_view/editable_diagram_collections.tsx
  - app/src/components/diagram_view/editable_diagram_edge.tsx
  - app/src/components/diagram_view/editable_diagram_group.tsx
  - app/src/components/diagram_view/editable_diagram_node.tsx
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Open an object-specific details editor by double-clicking a node, edge, or group.

## Scope

Use one dialog shell with focused editors for each object kind. Fields come from the validated diagram schema and diagram type. Dialog buttons appear bottom right; validation errors remain in the dialog and operational errors use `dialogService`.

## Acceptance criteria

* Double-click opens details for the identified object without also moving or drilling down.
* Save invokes focused mutation operations; Cancel changes nothing.
* Unsupported fields are not shown for the active diagram type.
* Missing selected objects close safely and report the real error outside render.

## State and rendering rule

The dialog reads fields from service accessors and keeps only its temporary form draft locally. Save calls field-specific service operations; it never submits a replacement object. Each changed field dispatches only its scoped event, so unrelated fields and diagram parents do not rerender.

## Dependencies

[F\_276](F_276_add_diagram_mutation_operations.md), [F\_279](F_279_validate_diagram_edit_operations.md), and [F\_291](F_291_add_direct_diagram_selection.md).
