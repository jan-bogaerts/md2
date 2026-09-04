---
author:
id: F_304
internalId: c27b7bc9-72f5-4547-beeb-009ea47174fc
title: add participant node tool
status: new
owner:
affects:
agents:
policy:
after: 69834d03-c154-4c81-a656-50de20aeb0ec
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add a Participant button to Nodes for sequence diagrams.

## Acceptance criteria

* The tool is available only for sequence diagrams.
* A new participant receives a valid ID, label, role, explicit position, and default size.
* Participant insertion keeps sequence columns deterministic without moving explicitly positioned participants.
* Existing messages, activations, and fragments remain valid.
* The new participant is selected and editable after placement.

## State and rendering rule

Creation adds one participant without rebuilding the participant array or existing participant objects. Only the participant ID-list host, the new participant leaf, and sequence view objects whose positions truly depend on insertion receive updates.

## Dependencies

[F\_302](F_302_add_node_placement_infrastructure.md) and [F\_278](F_278_make_diagram_layout_compatible_with_editing.md).