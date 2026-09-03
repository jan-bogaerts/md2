---
author:
id: F_299
internalId: 280027c6-d553-4c20-9fb4-af9010ce2c39
title: add diagram cut tool
status: new
owner:
affects:
agents:
policy:
after: 531e8784-9f9b-42d0-9eba-1f62646227f4
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add Cut to the Edit toolbox section.

## Acceptance criteria

* Cut serializes the supported selection before invoking the shared deletion operation.
* It includes relationships whose required endpoints are both selected.
* It is disabled for empty or unsupported selection.
* A failed clipboard write leaves the diagram unchanged and reports an error.
* A successful cut produces the same change set as deleting that selection.

## Dependencies

[F_297](F_297_add_diagram_delete_tool.md) and [F_300](F_300_add_diagram_copy_tool.md).
