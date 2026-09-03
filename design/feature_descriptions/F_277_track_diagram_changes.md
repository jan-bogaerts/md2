---
author:
id: F_277
internalId: d8f5366f-df99-4b4a-9537-15b3e395fbfb
title: track diagram changes
status: design
owner:
affects:
agents:
policy:
after: 5347a970-419c-495a-9b4e-c9aafcce6741
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Maintain a semantic change set between the immutable original and editable diagram.

## Scope

* Track additions, removals, and field changes by stable object identity.
* Collapse repeated edits into the net change from the original.
* Remove a change when an object is restored to its original value.
* Keep change ordering deterministic for review and agent prompts.
* Derive dirty state from the actual change set.

## Acceptance criteria

* Move-then-move records one final move; add-then-delete records no change.
* Changes never depend on derived label positions, fan-in counts, surface size, or other positioned fields.
* Every mutation operation produces the correct net change set.
* A structurally equal editable diagram has an empty change set and is not dirty.

## Dependencies

[F\_275](F_275_add_diagram_edit_session_service.md) and [F\_276](F_276_add_diagram_mutation_operations.md).