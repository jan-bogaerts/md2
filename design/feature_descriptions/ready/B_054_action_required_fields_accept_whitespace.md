---
id: B-054
title: action required fields accept whitespace-only values
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Shared `requireString` checks only `value.length > 0`. Whitespace-only ids, names, labels, descriptions, prompts, commands, link ids, and regular-expression conditions can pass required validation and be persisted.

## Fix

- Separate required human text, identifiers, executable text, and regular-expression validation where their rules differ.
- Reject values whose `trim()` is empty for every required string.
- Do not silently trim and mutate non-empty user content. Prompt/command leading whitespace can be meaningful.
- Apply identifier syntax rules already established by the action model; if none exist beyond non-whitespace, do not invent stricter naming rules in this card.
- Return structured field/index metadata through [[B-053]].

## Edge cases

- Spaces, tabs, CR/LF, and Unicode whitespace.
- Multiline prompt/command containing only whitespace.
- Prompt/command with meaningful indentation plus non-whitespace content.
- Regular expression containing a literal escaped space versus a raw whitespace-only expression.
- Duplicate names that differ only by surrounding whitespace; reject the surrounding-whitespace form rather than normalizing identity silently.

## acceptance criteria

- No required action field can be saved with a whitespace-only value.
- Meaningful prompt/command indentation is preserved.
- Validation behavior is identical in React and Electron.
- Field/list helper text identifies the exact invalid value.
- Shared tests cover ASCII and Unicode whitespace, meaningful indentation, identifiers, links, and regular expressions.

## see also

- [[B-053]]
- [[J-012]]
- `design\architecture\initial description\writings\action_editor.md`
