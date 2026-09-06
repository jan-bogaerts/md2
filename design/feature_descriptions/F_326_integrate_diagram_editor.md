---
author:
id: F_326
internalId: 59dd5932-3f6c-4b9e-aa4e-99c2c0419b7d
title: integrate diagram editor
status: ready
owner:
affects:
agents:
  - design/activity/card__59dd5932-3f6c-4b9e-aa4e-99c2c0419b7d.json
policy:
after: 2c3dd0ae-5b3d-44e6-8186-a7c28544995a
changedFiles:
  - app/src/components/diagram_view/diagram_architecture_edge_button.tsx
  - app/src/components/diagram_view/diagram_comparison.tsx
  - app/src/components/diagram_view/diagram_comparison_layout.test.tsx
  - app/src/components/diagram_view/diagram_comparison_layout.tsx
  - app/src/components/diagram_view/diagram_component_node_button.tsx
  - app/src/components/diagram_view/diagram_decision_node_button.tsx
  - app/src/components/diagram_view/diagram_dependency_edge_button.tsx
  - app/src/components/diagram_view/diagram_editor_integration.test.tsx
  - app/src/components/diagram_view/diagram_editor_rendering.test.tsx
  - app/src/components/diagram_view/diagram_end_node_button.tsx
  - app/src/components/diagram_view/diagram_entity_node_button.tsx
  - app/src/components/diagram_view/diagram_entity_relationship_button.tsx
  - app/src/components/diagram_view/diagram_flow_edge_button.tsx
  - app/src/components/diagram_view/diagram_group_button.tsx
  - app/src/components/diagram_view/diagram_legend_details_editor.tsx
  - app/src/components/diagram_view/diagram_legend_entry_editor.tsx
  - app/src/components/diagram_view/diagram_new_pane.tsx
  - app/src/components/diagram_view/diagram_participant_button.tsx
  - app/src/components/diagram_view/diagram_sequence_edge_button.tsx
  - app/src/components/diagram_view/diagram_start_node_button.tsx
  - app/src/components/diagram_view/diagram_state_node_button.tsx
  - app/src/components/diagram_view/diagram_step_node_button.tsx
  - app/src/components/diagram_view/diagram_toolbox_tool_button.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/diagram_view/diagram_zoom_in_button.tsx
  - app/src/components/diagram_view/diagram_zoom_out_button.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.test.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.tsx
  - app/src/components/diagram_view/use_diagram_tool.ts
  - app/src/components/diagram_view/vertical_diagram_comparison.test.tsx
  - app/src/components/diagram_view/vertical_diagram_comparison.tsx
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Complete cross-feature integration after the focused editor jobs have landed.

## Scope

Resolve integration seams only: comparison modes, toolbox overlays, legend, breadcrumbs, drill-down menus, action popup, change review, agent handoff, focus, mobile layout, and all five renderers. Do not add new tools or requirements. Copy persistence remains F\_327.

## Acceptance criteria

* Architecture, dependency, sequence, both flow presets, and entity diagrams complete their supported edit workflows.
* Current remains immutable; New remains canonical and valid.
* Pointer and keyboard behavior work at supported zoom levels and comparison layouts.
* Review and agent handoff use the same current edit-session data.
* Focused integration tests pass, existing diagram tests remain valid, and app lint passes.

## State and rendering rule

Integration must preserve the F\_329 event graph. Add render-count tests for metadata, node, edge, group, fragment, selection, geometry, zoom, and tool changes. Each test must prove the owning leaf rerenders and root, parent, collection, sibling, and unrelated leaves do not.

## Dependencies

All earlier F\_255 jobs. Copy persistence is completed by [F\_327](F_327_save_edited_diagram_as_copy.md).
