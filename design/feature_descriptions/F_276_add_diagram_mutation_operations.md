---
author:
id: F_276
internalId: 5347a970-419c-495a-9b4e-c9aafcce6741
title: add diagram mutation operations
status: ready
owner:
affects:
agents:
  - design/activity/card__5347a970-419c-495a-9b4e-c9aafcce6741.json
policy:
changedFiles:
  - patch276.py
  - patch276b.py
  - patch276c.py
after: cc6a602a-de2d-46bd-a49e-eae08d85495d
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Give the edit-session service focused operations that assign only the requested field or change only the requested collection membership.

## Scope

* Add explicit operations for creating and removing nodes, edges, groups, and fragments.
* Add field-specific operations for metadata and each object kind. Do not add `setDiagram`, `updateDiagram`, generic object replacement, or patch-object APIs.
* A field operation looks up the stable owner by ID, validates the requested value, assigns that field on the existing object, and dispatches an identity-and-field-scoped `EventTarget` event.
* A collection operation mutates membership in place. It publishes a new stable ID-list view snapshot only for that collection; existing member objects and unrelated collections retain their references.
* Cascading operations update each affected reference in one service transaction, then dispatch the exact field and membership events caused by the transaction. There is no complete-diagram event.
* Return values report success or the created stable ID; they do not return rebuilt diagram objects.

## Acceptance criteria

* Changing one field preserves the diagram, all collection, owner-object, and unrelated-object references.
* Components never replace, merge, or submit a complete diagram or diagram object.
* Existing object IDs stay stable; new objects receive collision-free IDs.
* Invalid operations do not partially mutate the edit session.
* Adding or removing an object notifies only its collection host and directly affected reference leaves.
* A field change never notifies a collection host, root, parent, or sibling object.
* Unit tests cover every public operation, exact emitted events, retained references, and reference cleanup.

## Dependencies

[F\_329](F_329_make_diagram_edit_updates_granular.md).
