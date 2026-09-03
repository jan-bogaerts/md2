---
author:
id: F_303
internalId: 69834d03-c154-4c81-a656-50de20aeb0ec
title: add component node tool
status: new
owner:
affects:
agents:
policy:
after: f82cd066-3072-4e2e-96d4-301bed26bae0
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add a Component button to Nodes for architecture and dependency diagrams.

## Acceptance criteria

* The tool is available only for architecture and dependency diagrams.
* Placement creates a component node with valid label, role, default size, and collision-free ID.
* The created node uses the existing component rendering and becomes selected.
* Details can edit all component fields permitted by the schema.
* Architecture and dependency tests cover placement and unavailable states.

## State and rendering rule

The button subscribes only to the diagram-type primitive needed for availability. Creation adds one component ID and object; later component fields are read by that component leaf from the service. Existing nodes and diagram parents do not receive component field events.

## Dependencies

[F_302](F_302_add_node_placement_infrastructure.md).
