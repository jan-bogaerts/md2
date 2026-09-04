---
author:
id: F_302
internalId: f82cd066-3072-4e2e-96d4-301bed26bae0
title: add node placement infrastructure
status: ready for implementation
owner:
affects:
agents:
policy:
after: f93c7796-e308-4859-a60a-ed282e4c0d2b
branch: f_302_add_node_placement_infrastructure
worktree: 2
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Provide shared behavior for every node tool.

## Scope

Handle tool activation, pointer preview, grid-snapped placement, cancellation, collision-free IDs, diagram-type availability, selection of the created node, and return to Select. Node-specific cards supply kind and defaults.

## Acceptance criteria

* Clicking New places one previewed node at diagram coordinates.
* Escape or pointer cancellation creates nothing.
* Placement is one validated mutation and one semantic addition.
* Unsupported node kinds are unavailable for the active diagram type.
* Shared behavior is tested once and node tools do not duplicate it.

## State and rendering rule

Placement adds one canonical node through the node-membership operation. The node ID-list snapshot changes once, the new leaf mounts by ID, and existing node objects and leaves retain their references. Preview position is isolated transient view state and never modifies diagram data.

## Dependencies

[F\_286](F_286_manage_active_diagram_tool.md), [F\_289](F_289_add_diagram_coordinate_conversion.md), and [F\_276](F_276_add_diagram_mutation_operations.md).