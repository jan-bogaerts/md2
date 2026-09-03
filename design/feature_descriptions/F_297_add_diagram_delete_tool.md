---
author:
id: F_297
internalId: 20ddf6f5-ccf5-4017-96ab-94985cfbcf13
title: add diagram delete tool
status: new
owner:
affects:
agents:
policy:
after: 62bae796-a019-452e-bc44-8d2a62318b48
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add a Delete action to the Edit toolbox section.

## Scope

Delete the complete selection through one mutation batch. Removing a node also removes attached edges and its group memberships. Removing an edge also removes its fragment references. Empty groups and fragments remain unless they were selected or become structurally invalid.

## Acceptance criteria

* Delete is disabled for empty selection.
* Cascading changes leave a valid diagram and appear in the semantic change set.
* The selection is cleared of removed identities.
* One activation produces one mutation publication.
* Current diagram data remains unchanged.

## State and rendering rule

Deletion mutates only affected collection memberships and references. Collection hosts receive new ID-list snapshots only for collections whose membership changed; surviving objects retain references and do not rerender unless one of their own references changed. There is no complete-diagram publication.

## Dependencies

[F_276](F_276_add_diagram_mutation_operations.md), [F_277](F_277_track_diagram_changes.md), and [F_290](F_290_add_diagram_selection_service.md).
