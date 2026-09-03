---
author:
id: F_286
internalId: f46ab1c9-a250-4dae-afd7-72b1afcaf3c5
title: manage active diagram tool
status: new
owner:
affects:
agents:
policy:
after: 2e295c0c-a5eb-4b2f-a36a-6c6f202a750a
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Own the active toolbox section and tool in the edit-session service.

## Acceptance criteria

* Exactly one persistent interaction tool is active at a time.
* One-shot actions such as zoom, delete, cut, copy, and paste execute without becoming drawing modes.
* Escape cancels an in-progress placement or edge gesture and returns to Select.
* Components subscribe through `useSyncExternalStore`; the toolbox does not own application state.
* Project change and session discard reset the active tool.

## Dependencies

[F_275](F_275_add_diagram_edit_session_service.md) and [F_285](F_285_add_resizable_diagram_toolbox.md).
