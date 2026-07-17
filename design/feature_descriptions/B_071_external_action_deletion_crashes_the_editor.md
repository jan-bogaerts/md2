---
id: B-071
title: external action deletion crashes the editor
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

When an open action is deleted externally, `ActionService.getDefinitionByPath` returns `null`. The action editor treats this expected file-watcher event as an invariant violation and throws `Missing external action definition` during reconciliation.

The editor crashes instead of closing the stale tab or presenting a recoverable deleted-file state. If the local draft is dirty, the user also has no explicit choice to recreate the action or discard the draft.

## Fix

- Represent external deletion as an explicit editor state rather than throwing.
- For a clean draft, close the tab or show that the file was deleted, following the existing text-view file deletion behavior.
- For a dirty draft, preserve it and offer explicit actions to recreate/save the file or discard the draft and close the tab.
- Ensure external delete handling cannot recreate the file automatically through an unmount flush.

## Edge cases

- Deletion while a save is queued or in flight.
- Delete followed quickly by recreation at the same path.
- Rename or move reported as delete plus add.
- Project switch while the deletion prompt is visible.
- Action referenced by other actions.

## acceptance criteria

- Externally deleting an open action never throws or crashes the editor pane.
- A clean deleted action follows a deterministic close/deleted-state flow.
- A dirty deleted action remains recoverable until the user explicitly recreates or discards it.
- Unmount and lifecycle flushing do not silently recreate an externally deleted action.
- Tests cover clean, dirty, queued-save, in-flight-save, delete/recreate, and delete/move cases.

## see also

- [[B-039]]
- [[B-052]]
- [[B-068]]
- `design\architecture\initial description\writings\action_editor.md`

