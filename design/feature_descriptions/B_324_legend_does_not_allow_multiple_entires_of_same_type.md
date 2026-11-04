---
author: 
id: B_324
internalId: 0744fffe-c0d8-4265-b945-ab88ba279702
title: legend does not allow multiple entires of same type
status: ready
owner: 
affects:
agents:
  - design/activity/card__0744fffe-c0d8-4265-b945-ab88ba279702.json
policy:
after: dbff8fd6-e09c-4ab4-909b-a2a15429e374
branch: b_324_legend_does_not_allow_multiple_entires_of_same_type
changedFiles:
  - app/src/components/diagram_view/details/diagram_edge_details_editor.tsx
  - app/src/components/diagram_view/details/diagram_node_details_editor.tsx
  - app/src/components/diagram_view/details/diagram_object_details_dialog.test.tsx
  - app/src/components/diagram_view/editing/diagram_editor_integration.test.tsx
  - app/src/components/diagram_view/editing/diagram_editor_rendering.test.tsx
  - app/src/components/diagram_view/editing/editable_diagram.test.tsx
  - app/src/components/diagram_view/editing/editable_diagram_edge.tsx
  - app/src/components/diagram_view/editing/editable_diagram_node.tsx
  - app/src/components/diagram_view/formatting/use_diagram_formatting.ts
  - app/src/components/diagram_view/legend/diagram_legend.test.tsx
  - app/src/components/diagram_view/legend/diagram_legend_connection_sample.tsx
  - app/src/components/diagram_view/legend/diagram_legend_details_editor.test.tsx
  - app/src/components/diagram_view/legend/diagram_legend_details_editor.tsx
  - app/src/components/diagram_view/legend/diagram_legend_entries.ts
  - app/src/components/diagram_view/legend/diagram_legend_entry_list.tsx
  - app/src/components/diagram_view/legend/diagram_legend_entry_row.tsx
  - app/src/components/diagram_view/legend/diagram_session_legend_entries.test.tsx
  - app/src/components/diagram_view/legend/diagram_session_legend_entries.tsx
  - app/src/components/diagram_view/rendering/diagram_edge.tsx
  - app/src/components/diagram_view/rendering/diagram_node.tsx
  - app/src/services/diagrams/diagram_change_descriptions.ts
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_derived_legend.ts
  - app/src/services/diagrams/diagram_edge_drawing_service.test.ts
  - app/src/services/diagrams/diagram_edge_drawing_service.ts
  - app/src/services/diagrams/diagram_edit_session_read_adapter.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_edit_types.ts
  - app/src/services/diagrams/diagram_edit_validation.ts
  - app/src/services/diagrams/diagram_formatting.ts
  - app/src/services/diagrams/diagram_formatting_editor.ts
  - app/src/services/diagrams/diagram_fragment_clipboard.test.ts
  - app/src/services/diagrams/diagram_fragment_clipboard.ts
  - app/src/services/diagrams/diagram_legend_editor.ts
  - app/src/services/diagrams/diagram_legend_entry_compatibility.ts
  - app/src/services/diagrams/diagram_legend_entry_key.ts
  - app/src/services/diagrams/diagram_node_placement_service.test.ts
  - app/src/services/diagrams/diagram_node_placement_service.ts
  - app/src/services/diagrams/diagram_object_field_editor.ts
  - app/src/services/diagrams/diagram_paste.test.ts
  - app/src/services/diagrams/diagram_paste_preparation.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - app/src/services/diagrams/empty_diagram_factory.ts
  - shared/diagram_data.d.mts
  - shared/diagram_data.mjs
  - shared/project_config_defaults.mjs
---
error message: Add legend entry rejected: `meta.legend has duplicate entry for connection:connection`

It must be possible to add multiple legend entries for the same node role, node kind, or connection kind. For example, two `connection` entries can represent different user-defined connection types.

## Current state

Legend entries have no identifier. `diagramLegendEntryKey` therefore uses their semantic value, such as `node:focal`, `nodeKind:component`, or `connection:connection`, as identity. The parser and `DiagramLegendEditor.addLegendEntry` reject duplicate semantic values to keep those keys unique.

The semantic key is also used by legend selection, React list keys, subscriptions, events, removal, ordering, and change tracking. Removing only the duplicate check would create key collisions. Nodes and edges do not reference legend entries; rendering and formatting use `node.role` and `edge.kind`, so the application could not determine which duplicate entry applies to an object.

A node has a `role` for its semantic/default styling and an optional `kind` for its shape and diagram rules. An edge has a `kind` for its behavior and diagram rules. A legend entry currently contains exactly one of `role`, `nodeKind`, or connection `kind`.

## Implementation

* Add a stable, opaque `id` to every legend entry. Use this ID for editing identity, React keys, selection, events, subscriptions, ordering, and change tracking. Do not derive it from the label or semantic value.
* Add `legendEntryId` to nodes and edges while retaining `node.role`, `node.kind`, and `edge.kind`. The existing fields continue to control shapes, defaults, and diagram validation. `legendEntryId` controls the object's user-defined legend classification.
* Keep exactly one of `role`, `nodeKind`, or connection `kind` on each legend entry. Allow multiple entries to carry the same value because their IDs are distinct.
* Validate every object reference. A node must reference a node-role or node-kind entry compatible with its role or effective kind. An edge must reference a connection entry compatible with its kind. Reject deletion of a legend entry while objects still reference it.
* Resolve formatting through `legendEntryId` so entries with the same semantic value can have independent formatting. The role or kind remains the source of the default style when the entry has no override.
* Update node and edge creation and details controls to select a legend entry. Creation tools may still choose the underlying role or kind, but they must store the selected legend entry ID on the created object.
* Bump the diagram data version and migrate existing diagrams in the same change. Materialize derived legends, generate stable entry IDs, and assign each existing node and edge to its matching entry. Do not keep a runtime legacy fallback that infers entry identity from role or kind.
* Update the parser, serializer, derived-legend handling, edit session indexes, read adapter, change registry and descriptions, legend UI, formatting store, and node and edge rendering.

The old legend resolution in `design/architecture/editable_diagram_contract.md` says legends are derived and not editable. It conflicts with the implemented editor. Updating that architecture document requires a separate explicit decision.

## Tests

* Parse and round-trip duplicate semantic entries with distinct IDs and valid object references.
* Reject duplicate legend IDs, missing references, incompatible references, and removal of a referenced entry.
* Add, rename, reorder, select, format, and remove one duplicate entry without affecting the other.
* Create and edit nodes and edges using a selected legend entry.
* Render two objects with the same role or kind but different legend labels and formatting.
* Migrate existing explicit and derived legends without changing node shapes or edge behavior.

## Acceptance criteria

1. A diagram can contain multiple legend entries with the same role, node kind, or connection kind.
2. Every node and edge references one compatible legend entry by stable ID while retaining its existing role and kind fields.
3. Editing or formatting one legend entry affects only objects that reference that entry.
4. Referenced legend entries cannot be removed until their objects are reassigned or removed.
5. Existing diagrams migrate to the new schema without changing their rendered structure or diagram behavior.
