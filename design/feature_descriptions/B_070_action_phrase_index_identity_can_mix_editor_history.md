---
id: B-070
title: action phrase index identity can mix editor history
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Predefined phrases use their array index as tab value, React key, Markdown document id, and history-store id (`phrase-0`, `phrase-1`, and so on). Deleting a phrase changes the identity of every following phrase.

The remaining phrase can therefore inherit the deleted phrase's tab/document identity while its previous undo/redo history is discarded or associated with another index. Selected-tab restoration is also positional rather than tied to the phrase the user selected.

## Fix

- Give every phrase a stable editor identity that survives insertion, deletion, and reordering.
- Keep transient editor identity out of persisted action JSON unless phrase identity is part of the domain contract.
- Key tabs and Markdown history by stable identity, while mapping edits back to the current phrase position.
- When deleting the selected phrase, explicitly select the prompt or a defined neighboring phrase and remove only the deleted phrase's history.

## Edge cases

- Deleting the first or middle phrase.
- Adding a phrase after a deletion.
- Deleting the currently selected phrase.
- External reload that adds, removes, or reorders phrases.
- Duplicate phrase titles and identical phrase text.

## acceptance criteria

- Adding, deleting, or reordering a phrase does not transfer undo/redo history between phrases.
- The selected tab continues to represent the same phrase while that phrase still exists.
- Deleting a phrase removes only that phrase's editor history.
- Stable editor identity is not serialized unless explicitly added to the action-definition schema.
- Tests cover deletion at every position, subsequent undo/redo, selection restoration, and external phrase changes.

## see also

- [[B-052]]
- [[B-061]]
- `design\architecture\initial description\writings\action_editor.md`

