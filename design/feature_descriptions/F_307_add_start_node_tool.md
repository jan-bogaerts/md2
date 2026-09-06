---
author:
id: F_307
internalId: ea81e86d-6036-45b6-8608-f4a91a7f59ed
title: add start node tool
status: ready
owner:
affects:
agents:
  - design/activity/card__ea81e86d-6036-45b6-8608-f4a91a7f59ed.json
policy:
after: a85ce58c-8bc9-42dd-b6ae-799830def5e8
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add a Start button for both flow presets.

## Acceptance criteria

* The tool is available only for flowchart and state diagrams.
* It applies the existing preset-specific start rendering and default geometry.
* Created nodes contain all schema-required fields and no type-incompatible fields.
* Placement, selection, details, moving, and resizing use the shared workflows.
* Tests cover both presets.

## State and rendering rule

The button subscribes only to type and preset availability. Creation adds one stable start object and one node-membership update. Preset-specific rendering is selected inside the new node leaf, not by rebuilding the diagram tree.

## Dependencies

[F\_302](F_302_add_node_placement_infrastructure.md).