---
id: J-003
title: delete dead refactor stubs and collapse rename shims
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Undo the fake part of the first J-002 attempt so the codebase reflects reality again: the "extracted" modules that nothing imports are deleted, and the one-line re-export shims are collapsed by renaming each `*_core`/`*_facade`/`*_content` monolith back to its original name. Pure mechanical cleanup — **no behavior change**. This is the prerequisite for J-004…J-010; do it first and land it as one commit.

## implementation details

### 1. Delete the 12 dead files (zero importers, verified 2026-07-07)
- `app/src/services/project_loading.ts`
- `app/src/services/card_operations.ts`
- `app/src/services/agent_integration.ts`
- `app/src/services/release_operations.ts`
- `app/src/services/action_history.ts`
- `app/src/services/action_text.ts`
- `app/src/services/config_persistence.ts`
- `app/src/services/config_entries.ts` (pure re-export)
- `app/src/components/actions/action_schedule_form.tsx`
- `app/src/components/actions/action_run_history.tsx`
- `app/src/components/actions/action_schedule_trigger.ts`
- `desktop/schedule_store.js`
- `desktop/schedule_timers.js`

Re-verify each has no importers before deleting (grep for the module name); if one gained an importer since the audit, keep it and note it in the commit message.

### 2. Collapse the rename shims
For each pair, delete the one-line shim, rename the real module back to the original name, and update all importers to the original path:
- `app/src/services/data_service.ts` (shim) ← `data_service_facade.ts`
- `app/src/services/config_service.ts` (shim) ← `config_service_core.ts`
- `app/src/services/action_runner.ts` (shim) ← `action_runner_core.ts`
- `app/src/components/actions/action_popup.tsx` (shim) ← `action_popup_content.tsx`
- `app/src/components/shell/project_toolbar_menu.tsx` (shim) ← `project_toolbar_menu_content.tsx`
- `desktop/action_scheduler_service.js` (shim) ← `action_scheduler_service_core.js`
- `desktop/local_git_service.js` (shim) ← `local_git_service_core.js`; also delete the pure named-re-export pass-throughs `desktop/git_commands.js`, `desktop/project_files.js`, `desktop/action_files.js` (J-006 recreates them as real modules).

Keep `project_session_service.ts` and `use_project_session.ts` — they are genuine extractions (see J-002 status).

## acceptance criteria
- None of the files listed in item 1 exist; no `*_core`/`*_facade`/`*_content` refactor-rename files remain.
- Every module lives under its original name with direct imports — no one-line re-export shims left from the J-002 attempt.
- `npm run typecheck`, lint and the full test suites pass in `app/` and `desktop/` with no test logic changes (import-path updates only).
- `git diff` shows deletions and renames only, no logic edits.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
