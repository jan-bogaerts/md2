---
author:
id: F_279
internalId: 2be66ea0-5097-4d45-a94e-d4a7b72331ca
title: validate diagram edit operations
status: new
owner:
affects:
agents:
policy:
after: 14f288d9-b541-4263-a2b5-74f1d1b95c68
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Prevent editing tools from creating diagram states that the parser or renderer cannot accept.

## Scope

Validate operation inputs at the service boundary, including diagram-type restrictions, references, required labels, grid geometry, edge kinds, cardinalities, and fragment regions. Report operational failures through `dialogService`; do not throw while React renders.

## Acceptance criteria

* Rejected operations leave canonical editable data and its change set unchanged.
* Errors identify the attempted operation and invalid field.
* Validation reuses the diagram contract instead of maintaining conflicting UI-only rules.
* Tests cover invalid references, types, geometry, and required semantic fields.

## Dependencies

[F_276](F_276_add_diagram_mutation_operations.md) and [F_278](F_278_make_diagram_layout_compatible_with_editing.md).
