---
id: B-058
title: unknown action fields are accepted then discarded on save
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: b79e4b28-5a79-4ca7-8b1c-ef1ba247abfa
---

## Problem

The shared action validator reads known properties into a new object but never rejects other properties. A typo such as `needsWorktree` therefore loads without an error, has no effect, and disappears when the editor saves any unrelated field.

This hides configuration mistakes and violates fail-fast/no-legacy-fallback rules.

## Fix

- Define the canonical allowed property set once in the shared action-definition module.
- Reject every own property outside that set with a structured `unknownField` error naming the property and source path.
- Apply the same rule to nested objects such as `on` entries and any structured `appliesTo` descriptor shape.
- Keep explicit extension points only if architecture defines them. Do not preserve arbitrary top-level fields as a compatibility bag.
- Ensure React loading/edit validation and Electron execution use the same validator.
- Do not auto-delete unknown fields through an editor save; loading must fail visibly before editing/persistence.

## Edge cases

- Unknown property value is `undefined` in an in-memory draft but would be omitted by JSON serialization.
- Misspelling differs only by case.
- Inherited/prototype properties versus own JSON properties.
- Nested `on` object includes both valid and unknown keys.
- Future schema addition must update validator, TypeScript declarations, editor, Electron, and tests together.

## acceptance criteria

- Unknown top-level and nested fields fail loading, save validation, and Electron execution validation.
- Error identifies exact field and source.
- No unrelated editor save can silently erase unknown data.
- Canonical allowed-field list is not duplicated across React and Electron.
- Tests cover typos, casing, nested fields, `undefined` drafts, and valid complete definitions.

## see also

- [[B-053]]
- [[J-012]]
- `design\architecture\initial description\writings\action_editor.md`
