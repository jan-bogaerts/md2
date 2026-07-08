---
id: B-038
title: corrupted last-project storage breaks every startup
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`readLastProject` (`app/src/data/project_session.ts`) calls `JSON.parse` on the `md2.lastProject` localStorage value without a guard and without validating the parsed shape. A corrupted or legacy-format value makes `loadLastProjectSession` throw on every launch: `useAppBootstrap` catches it and shows "Startup failed", but the bad value is never cleared, so the app fails identically on every subsequent start until the user manually clears site storage. A malformed-but-parseable value (missing `project.branch`, wrong `storageType`) fails later with a confusing storage error instead.

## Fix
- Wrap the parse in try/catch; on parse failure, `localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)` and return `null` (self-heal to the "no last project" path).
- Validate the parsed shape before returning: `storageType` is one of `'github' | 'local' | 'remote'`, `project` is an object with a string `branch` and string `id`; anything else is treated the same as a parse failure.
- Optionally report the discard through the workspace notice/telemetry path so silent data loss is visible, consistent with B-024.

## acceptance criteria
- With garbage in `md2.lastProject`, the app starts cleanly to the "no project" state and the key is removed; the next start does not re-fail.
- With a structurally invalid but parseable value, same behavior.
- A valid value restores the project exactly as today.
- Unit tests cover garbage, invalid-shape and valid cases.

## see also
- `design\feature_descriptions\ready\B_007_bootstrap_error_hidden.md`
- `design\feature_descriptions\ready\B_024_swallowed_errors.md`
