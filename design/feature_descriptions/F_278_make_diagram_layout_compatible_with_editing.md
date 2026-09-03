---
author:
id: F_278
internalId: 14f288d9-b541-4263-a2b5-74f1d1b95c68
title: make diagram layout compatible with editing
status: new
owner:
affects:
agents:
policy:
after: 056265ee-3d0f-4922-8e2d-282f91bad667
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Make `layout()` produce valid rendering geometry after partial edits without overwriting explicit user geometry.

## Scope

* Continue filling only missing node positions, sizes, connection points, and routes.
* Recalculate derived surface bounds, labels, fan-in, activations, and fragment rendering after mutations.
* Honour independent group geometry instead of always deriving group bounds from members.
* Re-route only edges whose stored geometry is absent or invalidated by an operation.

## Acceptance criteria

* Explicit user geometry survives unrelated changes.
* Moving a node updates attached edge rendering without moving unrelated nodes.
* All five diagram types remain renderable after supported mutations.
* `layout()` does not mutate its input.

## Dependencies

[F_274](F_274_add_editable_connection_points.md) and [F_276](F_276_add_diagram_mutation_operations.md).
