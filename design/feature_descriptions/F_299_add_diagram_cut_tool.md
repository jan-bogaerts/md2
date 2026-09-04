---
author:
id: F_299
internalId: 280027c6-d553-4c20-9fb4-af9010ce2c39
title: add diagram cut tool
status: ready for implementation
owner:
affects:
agents:
policy:
after: 531e8784-9f9b-42d0-9eba-1f62646227f4
branch: f_299_add_diagram_cut_tool
worktree: 2
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add Cut to the Edit toolbox section.

## Acceptance criteria

* Cut serializes the supported selection before invoking the shared deletion operation.
* It includes relationships whose required endpoints are both selected.
* It is disabled for empty or unsupported selection.
* A failed clipboard write leaves the diagram unchanged and reports an error.
* A successful cut produces the same change set as deleting that selection.

## State and rendering rule

Cut reads selected fields for clipboard serialization, then uses granular deletion. Reading does not publish state. Successful removal notifies only affected collections and references; clipboard or serialization work cannot rebuild or republish the diagram.

## Dependencies

[F\_297](F_297_add_diagram_delete_tool.md) and [F\_300](F_300_add_diagram_copy_tool.md).