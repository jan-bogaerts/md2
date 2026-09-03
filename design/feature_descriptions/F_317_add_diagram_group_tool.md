---
author:
id: F_317
internalId: 587b42de-3d65-4665-9cb8-b714397a6964
title: add diagram group tool
status: new
owner:
affects:
agents:
policy:
after: c8d8482b-8abb-44a6-8ee1-1ca4e45e035c
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add a Group drawing tool and make groups independently positioned and sized.

## Scope

Extend DiagramGroup with grid-aligned x, y, width, and height. Draw a rectangular group on New, then enter its label. Permit an initially empty member list; membership is handled separately.

## Acceptance criteria

* Group geometry is persisted and no longer derived from member bounds.
* Pointer preview and completion work through scroll and zoom.
* A completed group has a valid ID, non-empty label, explicit geometry, and selectable rendering.
* Moving member nodes does not move or resize the group.
* A group without explicit geometry uses automatic layout; the first user move or resize writes explicit geometry.

## State and rendering rule

Creation changes group membership once and mounts one group leaf by ID. Group x, y, width, height, and label are assigned on that stable group object and observed only by its leaf. Member nodes and diagram parents do not rerender when independent group geometry changes.

## Dependencies

[F_278](F_278_make_diagram_layout_compatible_with_editing.md), [F_289](F_289_add_diagram_coordinate_conversion.md), and [F_286](F_286_manage_active_diagram_tool.md).
