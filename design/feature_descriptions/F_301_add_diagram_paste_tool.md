---
author:
id: F_301
internalId: f93c7796-e308-4859-a60a-ed282e4c0d2b
title: add diagram paste tool
status: new
owner:
affects:
agents:
policy:
after: 1baf99c7-1d5e-40a4-8702-29de72e0be62
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Paste a validated diagram fragment into New.

## Acceptance criteria

* Every pasted object receives a collision-free ID and all internal references are remapped.
* Geometry is offset on the grid so pasted objects do not exactly cover their source.
* Unsupported object kinds for the target diagram type are rejected before mutation.
* Pasted objects become the active selection.
* Repeated paste uses a deterministic additional offset.
* One paste dispatches the exact collection-membership and affected-reference events after its validated transaction.

## State and rendering rule

Paste mutates only target collections and newly created objects. Existing objects retain their references. Collection hosts rerender once for changed ID membership; new leaves mount by ID, while existing leaves, diagram roots, and unrelated collections do not rerender.

## Dependencies

[F_276](F_276_add_diagram_mutation_operations.md), [F_279](F_279_validate_diagram_edit_operations.md), and [F_300](F_300_add_diagram_copy_tool.md).
