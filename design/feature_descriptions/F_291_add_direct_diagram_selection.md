---
author:
id: F_291
internalId: 2f8b255c-a6f9-4f92-ad54-3f4358b2e512
title: add direct diagram selection
status: ready for implementation
owner:
affects:
agents:
policy:
after: 71998afb-3b7f-4da7-87e4-95e5c931a702
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Implement direct selection in the Select tool.

## Acceptance criteria

* Clicking a New node, edge, or group replaces selection with that object.
* Clicking empty New surface clears selection.
* Current remains read-only and retains its existing drill-down behavior.
* Selected objects have a visible theme-backed focus treatment.
* Keyboard activation selects the focused object without opening its drill-down menu while editing.

## State and rendering rule

A click invokes the selection service only. The clicked and previously selected leaves observe their own selected booleans; the diagram root, object collections, and unrelated objects do not subscribe to selection as a complete list and do not rerender.

## Dependencies

[F\_286](F_286_manage_active_diagram_tool.md) and [F\_290](F_290_add_diagram_selection_service.md).