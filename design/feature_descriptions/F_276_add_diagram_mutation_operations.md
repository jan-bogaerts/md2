---
author:
id: F_276
internalId: 5347a970-419c-495a-9b4e-c9aafcce6741
title: add diagram mutation operations
status: new
owner:
affects:
agents:
policy:
after: 056265ee-3d0f-4922-8e2d-282f91bad667
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Give the edit-session service focused operations for changing canonical `DiagramData`.

## Scope

Add operations to create, update, move, resize, and remove nodes, edges, groups, fragments, metadata, and legend data. Each operation receives stable object IDs, validates before publication, updates only affected fields, and emits granular events.

## Acceptance criteria

* Components never replace or merge a complete diagram directly.
* Every operation produces canonical data deterministically.
* Existing object IDs stay stable; new objects receive collision-free IDs.
* Invalid operations do not partially mutate the edit session.
* Unit tests cover every public operation and reference cleanup.

## Dependencies

[F_273](F_273_define_editable_diagram_contract.md) and [F_275](F_275_add_diagram_edit_session_service.md).
