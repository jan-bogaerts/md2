---
id: B-053
title: action validation errors are mapped by message substrings
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 555fe039-ea8a-441d-a058-87e9b2103e56
---

## Problem

`action_service.ts` derives a field by searching human-readable error text for field-name substrings. This is ambiguous:

- `Circular action reference` can map to `on` because `action` contains `on`;
- an unknown-model error also contains `agent` and can appear under the agent selector;
- ids and source paths can accidentally contain field names;
- list-level errors disappear when the mapped collection has no rendered rows.

The editor therefore does not reliably show the actual error beside the relevant input.

## Fix

- Make the shared validator throw/return a structured `ActionValidationError` containing a stable code, message, field, optional item index/path, and source path.
- Preserve this structure through React loading/edit validation and Electron execution validation.
- Map `onBefore`, `on`, and `onAfter` cycles to every participating list or to a visible definition-level error summary when one field is not sufficient.
- Render collection errors at the section level even when the collection is empty.
- Keep user-facing text separate from routing metadata; never inspect message text to choose a control.
- Show a general error summary for definition/file errors without a meaningful field.

## Edge cases

- Cycle crosses all three link types.
- Duplicate id/name originates in another file.
- Unknown action id occurs at a specific list index.
- Invalid regular expression occurs after reordering rules.
- Error includes words such as `model`, `agent`, or `on` inside an action id/path.

## acceptance criteria

- Every validator failure has stable structured metadata.
- Relevant control/section shows the exact message, including for empty lists.
- Circular-reference and unknown-model errors cannot be routed by incidental text.
- Electron logs retain source path and validation code without exposing stack traces to users.
- Tests cover each error code, ambiguous messages, list indexes, empty collections, and general errors.

## see also

- `design\architecture\initial description\writings\action_editor.md`
- [[J-012]]
