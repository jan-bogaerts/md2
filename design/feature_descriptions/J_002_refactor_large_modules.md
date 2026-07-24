---
id: J-002
title: refactor oversized modules into focused files, classes and services
status: split
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Split the modules that have grown past a single responsibility into focused files/classes so the architecture rules hold again: components own presentation only, domain workflows live in services, and each file has one reason to change. Pure refactor — **no behavior change**.

## Outcome — split into sub-tasks (2026-07-07)
The first attempt largely **renamed the monoliths instead of splitting them**: each original file became a one-line re-export shim pointing at a `*_core`/`*_facade`/`*_content` copy of the whole module, and most of the "extracted" modules were dead code nothing imported. Behavior stayed correct (all tests pass), but the structural goal was not met — the task was too large for one pass. It has been split into eight focused tasks; this file is now only the umbrella record.

**Genuinely completed here (keep):**
- `project_session_service.ts` + `use_project_session.ts`: real extraction; the toolbar menu component makes zero direct data-service calls, so B-017's domain-logic goal is met.
- Item 8 — resolved by J-012: React and desktop `agent_profiles` now share one validator implementation.
- Item 9 — the four old B-023 re-export shims and the duplicated `local_git_storage_service.test.ts` are gone; `PROJECT_README_TEMPLATE` is a shared constant per side.

**Remaining work, per sub-task (do J-003 first; the rest are independent):**
- **J-003** — delete the 12 dead stub files and collapse the rename shims (prerequisite for all others).
- **J-004** — extract the four project toolbar menu dialogs (rest of item 1).
- **J-005** — split `data_service.ts` into scoped collaborators behind the facade (item 2).
- **J-006** — split `desktop/local_git_service.js` into git/project/action modules + aggregator (item 3).
- **J-007** — split `desktop/action_scheduler_service.js` into store + timers + service (item 4).
- **J-008** — move action-runner helpers to Electron as part of the single-runner design (item 5).
- **J-009** — split `config_service.ts` into entries + persistence + service (item 6).
- **J-010** — extract action popup schedule form + run history subcomponents (item 7).

## Ground rules (apply to every sub-task)
- One extraction per commit; run `npm run typecheck` and the test suite after each (never `npm run build` for type checking).
- An extraction must **move** code, not copy or re-export it — a new file whose logic still lives inline in the original is the failure mode that sank the first attempt.
- Keep existing exported names working so bridge contracts (`preload`, remote-control dispatch) and imports do not churn in the same commit as the split.
- New files follow the existing conventions: snake_case filenames, singleton services registered through `service_injector`, dependencies passed via constructor/init objects for testability.
- No new abstractions beyond what the split needs — extract along existing seams, don't redesign.

## acceptance criteria
- All eight sub-tasks (J-003 … J-010) are completed; their individual acceptance criteria replace the ones formerly listed here.

## see also
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
- `design\feature_descriptions\J_004_split_project_toolbar_menu_dialogs.md`
- `design\feature_descriptions\J_005_split_data_service_collaborators.md`
- `design\feature_descriptions\J_006_split_local_git_service.md`
- `design\feature_descriptions\J_007_split_action_scheduler_service.md`
- `design\feature_descriptions\J_008_split_action_runner_helpers.md`
- `design\feature_descriptions\J_009_split_config_service.md`
- `design\feature_descriptions\J_010_split_action_popup.md`
- `design\feature_descriptions\B_017_project_workspace_domain_logic.md`
- `design\architecture\initial description\data management.md`
