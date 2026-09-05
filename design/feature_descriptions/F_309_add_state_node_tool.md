---
author:
id: F_309
internalId: 6d5c19d7-a264-4f01-ba49-413310e223ef
title: add state node tool
status: new
owner:
affects:
agents:
policy:
after: 1d937bde-19d5-467d-ad73-67ef587493fe
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add a State button for state diagrams.

## Acceptance criteria

* The tool is available only for flow diagrams with the state preset.
* Placement creates a valid state node using existing rendering and shared placement.
* The node becomes selected and exposes state-node details.
* Flowcharts and other diagram types do not offer the button.

## State and rendering rule

The button subscribes only to type and preset availability. Creation adds one stable state object; later field and geometry changes notify only that state leaf and direct edge dependants.

## Dependencies

[F_302](F_302_add_node_placement_infrastructure.md).
