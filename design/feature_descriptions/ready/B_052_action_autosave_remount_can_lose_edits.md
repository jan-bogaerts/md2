---
id: B-052
title: action autosave remount can lose in-flight edits
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

`TextView` keys `ActionEditor` by `actionDefinitionRevision(activeAction)`. Every successful save publishes a new action object and changes that key, remounting the editor. A save started for revision A can finish after the user has typed revision B; the remount restores A and cancels B's pending debounce. Normal saves also lose field/editor focus and cursor state.

`isSaving` is a boolean, so overlapping saves can also report idle when an older/newer request remains active.

## Fix

- Key the editor by stable action identity/path, not serialized content.
- Keep one draft for the mounted action and synchronize external changes explicitly.
- Serialize saves per action path or attach monotonically increasing revisions. A stale completion must never replace a newer draft or mark it saved.
- Track saved, saving, dirty, invalid, and failed revisions separately.
- On external file reload while dirty, preserve the local draft and show a conflict/reload choice; do not silently overwrite either version.
- Flush or await a valid dirty draft when switching tabs/unmounting if existing editor-save conventions require it.
- Preserve focus and Markdown cursor across successful saves.

## Edge cases

- User edits while persistence is slow.
- Save A fails after save B succeeds.
- Action is externally edited or deleted while tab is open.
- User changes action type during an in-flight prompt save.
- User closes tab, switches project, or closes app during debounce/save.

## acceptance criteria

- Successful auto-save never remounts the active editor or loses focus/cursor.
- Typing during an in-flight save cannot be overwritten or cancelled by that save's completion.
- Persisted content eventually equals newest valid draft.
- Save status reflects newest revision and concurrent work accurately.
- External conflicts are visible and require an explicit resolution.
- Tests use deferred promises to cover out-of-order success/failure, continued typing, tab changes, external reload, and focus preservation.

## see also

- `design\architecture\initial description\writings\action_editor.md`
- `app/src/components/editor/markdown_editor_flush.ts`
