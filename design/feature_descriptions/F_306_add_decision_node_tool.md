---
author:
id: F_306
internalId: a85ce58c-8bc9-42dd-b6ae-799830def5e8
title: add decision node tool
status: ready
owner:
affects:
agents:
  - design/activity/card__a85ce58c-8bc9-42dd-b6ae-799830def5e8.json
policy:
after: a0dbf3d9-3dde-43d0-962a-58d79e747f8d
branch: f_306_add_decision_node_tool
worktree: 2
changedFiles:
  - app/src/components/diagram_view/diagram_component_node_button.test.tsx
  - app/src/components/diagram_view/diagram_component_node_button.tsx
  - app/src/components/diagram_view/diagram_decision_node_button.test.tsx
  - app/src/components/diagram_view/diagram_decision_node_button.tsx
  - app/src/components/diagram_view/diagram_node.test.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/services/diagrams/diagram_node_placement_service.test.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add a Decision button for flowchart diagrams.

## Acceptance criteria

* The tool is offered only for the flowchart preset.
* Placement creates a valid decision node with decision-specific default geometry.
* The diamond renders and resizes without corrupting its stored rectangular bounds.
* Outgoing branches remain subject to required-label validation.
* The created decision is selected and editable.

## State and rendering rule

The button subscribes only to type and preset availability. Creation adds one stable decision object. Geometry and branch validation update only that node and directly dependent edge leaves; no diagram-wide layout or publication occurs.

## Dependencies

[F\_302](F_302_add_node_placement_infrastructure.md) and [F\_279](F_279_validate_diagram_edit_operations.md).
