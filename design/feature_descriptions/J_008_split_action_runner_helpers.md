---
id: J-008
title: extract action runner history and text helpers
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Item 5 of J-002. `app/src/services/action_runner.ts` is ~568 lines; the history bookkeeping and text/placeholder helpers are separable concerns. Extract them so `ActionRunner` keeps orchestration only (chain order, circular check, run state). Pure refactor — **no behavior change**.

Depends on: J-003 (unused `action_history.ts`/`action_text.ts` duplicates deleted, module back at `action_runner.ts`) — this task recreates those filenames by **moving** the inline implementations.

## implementation details
- `services/action_history.ts` — history append/load helpers and commit-metadata extraction (`extractCommitMetadata`, `COMMIT_LINE_PATTERN`).
- `services/action_text.ts` — placeholder resolution and agent-prompt building (`resolvePlaceholders`, `resolveAgentPrompt`), shared with anything else that resolves `{{file}}`/`{{rootProjectFolder}}`.
- The runner imports these; no copies of the moved functions remain inline (the first attempt left them inline with unused duplicates on disk).
- Two commits (history, then text); run `npm run typecheck` and the app test suite after each. Move helper-specific tests next to the new modules.

## acceptance criteria
- `action_runner.ts` is under ~300 lines and no longer defines `resolvePlaceholders`, `resolveAgentPrompt` or `extractCommitMetadata` — it imports them.
- The helpers are unit-testable without an `ActionRunner` instance.
- `ActionRunner` public API unchanged; existing tests pass unmodified except for import paths.
- `npm run typecheck`, lint and the app test suite pass after every commit.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
