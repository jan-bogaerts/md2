---
id: J-002
title: refactor oversized modules into focused files, classes and services
status: in progress
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Split the modules that have grown past a single responsibility into focused files/classes so the architecture rules hold again: components own presentation only, domain workflows live in services, and each file has one reason to change. Pure refactor — **no behavior change**, public entry points stay stable, tests move with the code they cover.

Current offenders (2026-07-06 audit): `project_toolbar_menu.tsx` (736 lines, 22 direct data-service/storage call sites), `data_service.ts` (830), `action_scheduler_service.js` (691), `local_git_service.js` (633), `config_service.ts` (543), `action_runner.ts` (541), `action_popup.tsx` (503), plus the duplicated `agent_profiles` TS/JS pair.

## Status per item (2026-07-07 audit — feature to be restarted)

The first attempt largely **renamed the monoliths instead of splitting them**: each original file became a one-line re-export shim pointing at a `*_core`/`*_facade`/`*_content` copy of the whole module, and most of the "extracted" modules were created as files but are **dead code — nothing imports them**, while the same logic still lives inline in the renamed monolith. Behavior is fine (all tests pass); the structural goal was not met.

**Done, keep:**
- Item 1 (partially): `project_session_service.ts` exists (207 lines, registered via injector, owns `createStorageService`/`dataService.init`/`writeLastProject`, branch listing, working-folder resolution, push, complete-release) and `use_project_session.ts` exists. `project_toolbar_menu_content.tsx` has **zero** direct data-service calls — the B-017 domain-logic goal is met.
- Item 8: `desktop/agent_profiles_parity.test.mjs` genuinely parses the TS source and compares built-ins + validation/command behavior. Works.
- Item 9: the four old B-023 re-export shims and the duplicated `local_git_storage_service.test.ts` are gone; `PROJECT_README_TEMPLATE` is a shared constant per side.

**Not done, redo:**
- Item 1 (rest): the four dialog components (`project_open_dialog.tsx`, `working_folder_chooser_dialog.tsx`, `new_card_dialog.tsx`, `complete_release_dialog.tsx`) were never extracted; `project_toolbar_menu_content.tsx` is 617 lines (target < 150).
- Item 2: `data_service_facade.ts` is 1,071 lines (bigger than the 830 it replaced). `project_loading.ts`, `card_operations.ts`, `agent_integration.ts`, `release_operations.ts` are 1-line aliases re-exporting the whole `DataService` — no collaborators exist.
- Item 3: `local_git_service_core.js` is a 694-line monolith; `git_commands.js` / `project_files.js` / `action_files.js` are pure named re-export lists from it, not split modules.
- Item 4: `action_scheduler_service_core.js` is unchanged at 691 lines; `schedule_store.js` and `schedule_timers.js` exist but are **unused** (the core keeps its own inline copies).
- Item 5: `action_runner_core.ts` is 568 lines and keeps `resolvePlaceholders`/`resolveAgentPrompt`/`extractCommitMetadata` inline; `action_history.ts` and `action_text.ts` are unused duplicates.
- Item 6: `config_service_core.ts` is 543 lines with the entry table and persistence inline; `config_entries.ts` is a re-export and `config_persistence.ts` an unused duplicate of the inline functions.
- Item 7: `action_popup_content.tsx` (495 lines) reimplements `createScheduleTrigger` inline; `action_schedule_form.tsx`, `action_run_history.tsx` and `action_schedule_trigger.ts` are unused duplicates.

**When restarting:** first delete the 12 dead files (`project_loading.ts`, `card_operations.ts`, `agent_integration.ts`, `release_operations.ts`, `action_history.ts`, `action_text.ts`, `config_persistence.ts`, `action_schedule_form.tsx`, `action_run_history.tsx`, `action_schedule_trigger.ts`, `schedule_store.js`, `schedule_timers.js`) and collapse the new one-line shims (`data_service.ts`, `config_service.ts`, `action_runner.ts`, `action_popup.tsx`, `project_toolbar_menu.tsx`, `action_scheduler_service.js`, plus the `git_commands/project_files/action_files` pass-throughs) so the real state is visible — then do the extractions for items 1 (dialogs), 2, 3, 4, 5, 6 and 7 for real. Acceptance criteria below stand unchanged.

## Ground rules
- One extraction per commit; run `npm run typecheck` and the test suite after each (never `npm run build` for type checking).
- Keep existing exported names working: the original module becomes a facade that re-exports or delegates, so bridge contracts (`preload`, remote-control dispatch) and imports do not churn in the same commit as the split.
- New files follow the existing conventions: snake_case filenames, singleton services registered through `service_injector`, dependencies passed via constructor/init objects for testability.
- No new abstractions beyond what the split needs — extract along existing seams, don't redesign.

## implementation details

### 1. `app/src/components/shell/project_toolbar_menu.tsx` → project session service + dialog components (completes B-017)
- Create `app/src/services/project_session_service.ts` (singleton, `register('projectSessionService', …)`) owning the domain orchestration currently inlined in the component: create/open GitHub project, open local folder, open remote project, `createStorageService` + `dataService.init` wiring, `writeLastProject`, branch listing/switching, working-folder resolution (missing-folder chooser flow), push, and complete-release invocation. Expose status/error through events like `dataService` does.
- Add `useProjectSession()` in `components/hooks/` wrapping the service with `useSyncExternalStore`.
- Split the JSX into sibling components under `components/shell/project/`: `project_open_dialog.tsx` (repo/branch pickers + manual fallback + local/remote entry), `working_folder_chooser_dialog.tsx`, `new_card_dialog.tsx` (type selector + title/body), `complete_release_dialog.tsx`. `project_toolbar_menu.tsx` keeps only the menu button, open-dialog state and composition.
- Target: menu component < 150 lines; no `createStorageService`/`writeLastProject`/`dataService.init` references outside the service.

### 2. `app/src/services/data_service.ts` → scoped collaborators behind the existing facade (per `data management.md`: "divided in subservices, depending on scope")
Keep `DataService` as the single public facade (components/hooks keep calling it), but move implementation into collaborator classes it instantiates:
- `services/project_loading.ts` — open/create project, phased root+background load, load tokens, snapshot creation, watch start/stop and watch-event routing.
- `services/card_operations.ts` — saveFile/updateCardBody/affects/header/title/policy, moveCard + ordering repair, deleteCard/deleteFile, createCard.
- `services/agent_integration.ts` — conversation resolution/attachment maps, start/continue/sendInput, run-event handling, onState trigger dispatch and error recording.
- `services/release_operations.ts` — completeRelease (+ `release_archiving` stays in data/).
- Remarkable import orchestration already lives mostly in `remarkable_import_service.ts`; move the remaining `importRemarkableImages`/metadata glue there.
- The commit batcher, `currentFiles`/snapshot state and `dispatchChanged` stay in the facade; collaborators receive a narrow state accessor, not the whole service.
- Target: `data_service.ts` < 250 lines of delegation + state.

### 3. `desktop/local_git_service.js` → three modules + aggregator
- `desktop/git_commands.js` — runGit/hasStagedChanges/commitStagedChanges, branch list/checkout, push, assertGitRoot, path guards (`ensureInsideRoot`, `requireRootPath` move here and are re-exported where needed).
- `desktop/project_files.js` — load project/root/config, read/write/delete/move files, working-folder template, watchProject.
- `desktop/action_files.js` — action definition loading, schedules load/save/cancel, run-history load/append, agent-conversation log reads.
- `local_git_service.js` remains as the aggregator (`module.exports = { ...gitCommands, ...projectFiles, ...actionFiles }`) so `preload.js`, `local_bridge_dispatch.js` and `main.js` are untouched.

### 4. `desktop/action_scheduler_service.js` → store + timers + service
- `desktop/schedule_store.js` — schedule file read/write/validation and status transitions (pure functions over the JSON model).
- `desktop/schedule_timers.js` — timer registration/cancellation per trigger type (`at`, `agentSlot`, `afterAction`), reconciliation against a store snapshot.
- `ActionSchedulerService` keeps project lifecycle, run execution via the agent runner, and event subscription, composing the two modules.

### 5. `app/src/services/action_runner.ts` → runner + helpers
- `services/action_history.ts` — history append/load helpers and commit-metadata extraction (`extractCommitMetadata`, `COMMIT_LINE_PATTERN`).
- `services/action_text.ts` — placeholder resolution and agent-prompt building (`resolvePlaceholders`, `resolveAgentPrompt`), shared with anything else that resolves `{{file}}`/`{{rootProjectFolder}}`.
- `ActionRunner` keeps orchestration (chain order, circular check, run state) only.

### 6. `app/src/services/config_service.ts` → entries + persistence + service
- `services/config_entries.ts` — the static entry metadata table (keys, sections, labels, types, defaults, scopes).
- `services/config_persistence.ts` — localStorage read/write for react/connection scopes and the desktop-bridge read/write adapter.
- `ConfigService` keeps merge, draft lifecycle, validation and events.

### 7. `app/src/components/actions/action_popup.tsx` → subcomponents
- Extract `action_schedule_form.tsx` (trigger picker + registration state) and `action_run_history.tsx` (history list rendering); popup keeps run/convert/agent-model selection and resize behavior. Move `createScheduleTrigger` next to the schedule form.

### 8. Duplicated `agent_profiles` implementations (TS + JS)
`app/src/data/agent_profiles.ts` and `desktop/agent_profiles.js` are parallel line-for-line implementations. The projects are deliberately standalone (J-001, no workspaces), so pick the pragmatic guard:
- keep `app/src/data/agent_profiles.ts` as the canonical implementation;
- add a desktop test (`desktop/agent_profiles_parity.test.mjs`) that asserts built-in profile data and validation/command-building behavior match the TS module (import the TS source via a tiny transpile step in the test, or compare against a shared `agent_profiles.builtins.json` both modules read);
- document in both files that changes must land in both, enforced by the parity test.

### 9. Fold in the mechanical B-023 leftovers while touching these files
Delete the four re-export shims (`data/github_storage_service.ts`, `data/local_git_storage_service.ts`, `auth/github_auth_service.ts`, `components/shell/running_agent_types.ts`) and update importers; remove the duplicated `data/local_git_storage_service.test.ts` (keep the services copy); share the `'# MD2\n\nProject design folder created by MD2.\n'` template as one exported constant per side.

## acceptance criteria
- All listed source files are under ~300 lines (components under ~200), with the extracted modules named as above or equivalently.
- `ProjectToolbarMenu` contains no storage/session orchestration; `projectSessionService` exists and B-017 can be closed.
- `DataService`, `local_git_service`, `ActionSchedulerService`, `ActionRunner`, `ConfigService` public APIs are unchanged (existing tests pass unmodified except for import paths).
- The agent-profiles parity test fails when the TS and JS implementations diverge.
- The B-023 shims/duplicates listed in item 9 are gone.
- `npm run typecheck`, lint and the full test suites pass in `app/` and `desktop/` after every extraction commit.

## see also
- `design\feature_descriptions\B_017_project_workspace_domain_logic.md`
- `design\feature_descriptions\B_023_dead_code_cleanup.md`
- `design\architecture\initial description\data management.md`
