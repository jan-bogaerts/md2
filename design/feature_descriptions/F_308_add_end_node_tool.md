---
author:
id: F_308
internalId: 99f79635-4a46-4254-b544-901530ad9294
title: add end node tool
status: ready
owner:
affects:
agents:
  - design/activity/card__99f79635-4a46-4254-b544-901530ad9294.json
policy:
changedFiles:
  - app/src/components/diagram_view/diagram_end_node_button.test.tsx
  - app/src/components/diagram_view/diagram_end_node_button.tsx
  - app/src/components/diagram_view/diagram_node.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/services/diagrams/diagram_node_placement_service.test.ts
after: ea81e86d-6036-45b6-8608-f4a91a7f59ed
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add an End button for both flow presets.

## Acceptance criteria

* The tool is available only for flowchart and state diagrams.
* It applies the existing preset-specific end rendering and default geometry.
* Created nodes contain required fields and no type-incompatible fields.
* Placement, selection, details, moving, and resizing use shared workflows.
* Tests cover both presets.

## State and rendering rule

The button subscribes only to type and preset availability. Creation adds one stable end object and one node-membership update. Preset-specific rendering is selected inside the new node leaf, not by rebuilding the diagram tree.

## Dependencies

[F\_302](F_302_add_node_placement_infrastructure.md).
