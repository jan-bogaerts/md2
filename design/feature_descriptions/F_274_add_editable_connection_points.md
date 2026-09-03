---
author:
id: F_274
internalId: cfe002ea-7a48-4c32-bed1-078fae7b5d5c
title: add editable connection points
status: design
owner:
affects:
agents:
policy:
branch: f_274_add_editable_connection_points
worktree: 2
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Represent edge endpoints as stable connection points on nodes so users can draw and reconnect edges precisely.

## Scope

* Extend the diagram schema with source and target attachment data based on node side and relative offset.
* Convert attachment data into absolute coordinates during layout.
* Preserve existing automatic port selection when attachment data is absent.
* Validate that endpoints reference their edge's `from` and `to` nodes and remain on a node boundary.
* Update serialization, parser tests, layout tests, and diagram-output instructions.

## Acceptance criteria

* A stored connection point follows its node when the node moves or resizes.
* Multiple edges can use distinct points on the same node side.
* Invalid endpoint data fails with a field-specific malformed-diagram error.
* Existing diagrams without explicit connection points render unchanged.

## Dependencies

[F\_273](F_273_define_editable_diagram_contract.md).