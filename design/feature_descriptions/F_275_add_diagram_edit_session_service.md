---
author:
id: F_275
internalId: cc6a602a-de2d-46bd-a49e-eae08d85495d
title: add diagram edit session service
status: design
owner:
affects:
agents:
policy:
after: cfe002ea-7a48-4c32-bed1-078fae7b5d5c
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Add a project-bound service that owns the original diagram, editable diagram, dirty state, and edit-session lifecycle.

## Scope

* Start a session from the active `DiagramViewService` diagram.
* Keep the original data unchanged and create one editable copy.
* Expose granular `EventTarget` notifications and stable snapshots for `useSyncExternalStore`.
* Reset the session on explicit discard, project change, or navigation to another source diagram.
* Do not create or mutate session state during React rendering.

## Acceptance criteria

* Editing never mutates `DiagramViewService.currentDiagram` or its loaded record.
* Subscribers rerender only for state they consume.
* Clear project and source-navigation behavior is deterministic and tested.
* Starting a second session cannot leak selection, tools, or draft data from the first.

## Dependencies

[F_273](F_273_define_editable_diagram_contract.md).
