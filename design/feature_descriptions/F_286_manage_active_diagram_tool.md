---
author:
id: F_286
internalId: f46ab1c9-a250-4dae-afd7-72b1afcaf3c5
title: manage active diagram tool
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__f46ab1c9-a250-4dae-afd7-72b1afcaf3c5.json
policy:
branch: f_286_manage_active_diagram_tool
worktree: 2
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Own the active toolbox section and tool in the edit-session service.

## Acceptance criteria

* Exactly one persistent interaction tool is active at a time.
* One-shot actions such as zoom, delete, cut, copy, and paste execute without becoming drawing modes.
* Escape cancels an in-progress placement or edge gesture and returns to Select.
* Components subscribe through `useSyncExternalStore`; the toolbox does not own application state.
* Project change and session discard reset the active tool.

## State and rendering rule

Active section, active persistent tool, and transient gesture state are separate service-owned primitives with separate events. Changing one does not rebuild a toolbox model, diagram model, or button collection; only consumers of that primitive rerender.

## Dependencies

[F\_275](F_275_add_diagram_edit_session_service.md) and [F\_285](F_285_add_resizable_diagram_toolbox.md).