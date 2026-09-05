---
author:
id: F_305
internalId: a0dbf3d9-3dde-43d0-962a-58d79e747f8d
title: add step node tool
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__a0dbf3d9-3dde-43d0-962a-58d79e747f8d.json
policy:
after: c27b7bc9-72f5-4547-beeb-009ea47174fc
branch: f_305_add_step_node_tool
worktree: 1
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add a Step button for flowchart diagrams.

## Acceptance criteria

* The tool is available only for flow diagrams with the flowchart preset.
* Placement creates a valid step node using the shared placement workflow.
* The node uses existing step styling, is selected, and exposes permitted details.
* State diagrams and other diagram types do not offer the button.

## State and rendering rule

The button subscribes only to type and preset availability. Creation adds one step through collection membership; existing node leaves and diagram roots do not rerender. Later step edits assign fields on that stable node.

## Dependencies

[F\_302](F_302_add_node_placement_infrastructure.md).