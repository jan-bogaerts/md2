---
author:
id: F_301
internalId: f93c7796-e308-4859-a60a-ed282e4c0d2b
title: add diagram paste tool
status: ready
owner:
affects:
agents:
  - design/activity/card__f93c7796-e308-4859-a60a-ed282e4c0d2b.json
policy:
changedFiles:
  - app/src/components/diagram_view/diagram_paste_button.test.tsx
  - app/src/components/diagram_view/diagram_paste_button.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/services/diagrams/diagram_copy.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_paste.test.ts
  - app/src/services/diagrams/diagram_paste.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

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

[F\_276](F_276_add_diagram_mutation_operations.md), [F\_279](F_279_validate_diagram_edit_operations.md), and [F\_300](F_300_add_diagram_copy_tool.md).
