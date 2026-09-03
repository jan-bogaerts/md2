---
author:
id: F_291
internalId: 2f8b255c-a6f9-4f92-ad54-3f4358b2e512
title: add direct diagram selection
status: new
owner:
affects:
agents:
policy:
after: 6e041d8b-7aca-4ab1-9be5-56d7e31d189c
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Implement direct selection in the Select tool.

## Acceptance criteria

* Clicking a New node, edge, or group replaces selection with that object.
* Clicking empty New surface clears selection.
* Current remains read-only and retains its existing drill-down behavior.
* Selected objects have a visible theme-backed focus treatment.
* Keyboard activation selects the focused object without opening its drill-down menu while editing.

## Dependencies

[F_286](F_286_manage_active_diagram_tool.md) and [F_290](F_290_add_diagram_selection_service.md).
