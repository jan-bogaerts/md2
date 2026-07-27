---
id: B-059
title: action validation serializes and reparses every draft
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 8bd15547-06dd-407b-b669-2cdc809ecafe
---

## Problem

`ActionService.validateDefinition` creates serialized JSON, inserts it into the file list, and calls the file loader, which parses it again. `ActionEditor` also serializes every draft before checking `validation.valid`. Invalid drafts are therefore serialized on every field change, contrary to the action-editor contract that serialization occurs only for a valid save.

JSON strings are also used as saved-state and React-key revisions, coupling UI lifecycle to persistence format.

## Fix

- Export one shared validator that accepts a structured raw definition plus source/dependencies without JSON round-tripping.
- Keep parsing as the file-loading boundary and serialization as the valid persistence boundary.
- Let graph validation accept structured `{ path, definition }` entries so duplicate/reference/cycle checks remain whole-project checks.
- Keep canonical raw definitions or a validated graph in `ActionService`; do not rebuild them from serialized strings per keystroke.
- Replace JSON-string dirty/revision checks with explicit draft/save revision tracking from [[B-052]].
- Serialize exactly once after final pre-save validation succeeds.

## Edge cases

- `undefined` optional properties that JSON would drop.
- Property order changes without semantic changes.
- Cycles/unknown references require all project definitions.
- Persistence serialization itself throws.
- Draft changes after validation but before persistence begins.

## acceptance criteria

- Editing/validation of an invalid draft performs no `JSON.stringify`/`JSON.parse` round trip.
- File loading parses once; valid save serializes once after validation.
- Whole-project duplicate/reference/cycle validation remains intact.
- UI draft lifecycle no longer depends on serialized JSON equality.
- Tests spy on parse/serialize boundaries and cover undefined optionals, property order, graph errors, and save-time revalidation.

## see also

- [[B-052]]
- [[B-053]]
- [[J-012]]
- `design\architecture\initial description\writings\action_editor.md`
