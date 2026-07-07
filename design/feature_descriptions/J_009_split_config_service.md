---
id: J-009
title: split config service into entries, persistence and service
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Item 6 of J-002. `app/src/services/config_service.ts` is ~543 lines mixing the static entry metadata table, scope persistence and the service logic. Extract the table and the persistence adapters so `ConfigService` keeps merge, draft lifecycle, validation and events. Pure refactor — **no behavior change**.

Depends on: J-003 (the `config_entries.ts` re-export and unused `config_persistence.ts` duplicate deleted, module back at `config_service.ts`) — this task recreates those filenames by **moving** the inline definitions.

## implementation details
- `services/config_entries.ts` — the static entry metadata table (keys, sections, labels, types, defaults, scopes), exported as data.
- `services/config_persistence.ts` — localStorage read/write for react/connection scopes and the desktop-bridge read/write adapter.
- `ConfigService` imports both; no inline copies of the moved table/functions remain (the first attempt kept them inline with dead duplicates on disk).
- Two commits (entries, then persistence); run `npm run typecheck` and the app test suite after each.
- Coordinate with B-036 (per-key config value typing): if B-036 lands first, the `ConfigValueTypes` map lives in `config_entries.ts`; if this lands first, leave an obvious home for it there.

## acceptance criteria
- `config_service.ts` is under ~300 lines and contains no entry-metadata literals or storage read/write internals.
- The entry table is importable as plain data; persistence adapters are unit-testable without a `ConfigService` instance.
- `ConfigService` public API unchanged; existing tests pass unmodified except for import paths.
- `npm run typecheck`, lint and the app test suite pass after every commit.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\B_036_config_values_not_typed_per_key.md`
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
