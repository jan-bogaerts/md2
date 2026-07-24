---
id: B-056
title: action applicability filters are not fully structured
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 14cba358-3518-4ec5-be56-cdbbbc186384
---

## Problem

`ActionFilterEditor` hardcodes `kind`, `type`, `state`, `file`, `folder`, and `worktree`, while `ActionContext` also exposes `worktreeError` and supports additional string fields. Existing unknown keys render as out-of-range selects. Every value is free text, even when the domain has known values.

This does not meet the structured-filter contract and makes valid existing filters difficult or impossible to edit safely.

## Fix

- Define filter descriptors beside the action-context model: key, label, supported context kinds, value source/control, and validation.
- Build editor field options from those descriptors; do not duplicate context keys in the component.
- Use structured values where available:
  - `kind`: card/file/folder;
  - `type`: configured card/special context types;
  - `state`: configured card states;
  - `file`: repository file selector;
  - `folder`: repository folder selector;
  - `worktree`: Git linked-worktree selector.
- Support every intentionally filterable context field. If arbitrary extension keys remain part of `ActionContext`, provide a controlled custom-key/value row rather than raw JSON.
- Keep all configured filters conjunctive and preserve insertion/order presentation consistently.
- Show field- and value-specific validation; an empty newly added value cannot save.

## Edge cases

- Current value disappears from project config/repository.
- Same key selected twice.
- Field change makes old value invalid.
- File/folder paths contain spaces or backslashes.
- No repository files/worktrees are loaded yet.
- Extension context key is present in an existing action.

## acceptance criteria

- Every supported context field can be represented and edited without raw JSON.
- Known-domain values use selectors, not unrestricted text.
- Existing stale/custom values remain visible and can be corrected or removed.
- Duplicate keys and empty values cannot be saved.
- Matching behavior remains all-filters-must-match.
- Component and context-model tests cover all descriptors, stale values, custom keys, duplicate prevention, and matching.

## see also

- `design\architecture\initial description\writings\action_editor.md`
- `app/src/data/action_context.ts`
