---
author: 
id: B_216
internalId: 7037a625-d650-4574-b1d5-874d90ba82a4
title: remove duplicate code
status: ready
owner: 
affects:
agents:
  - design/activity/card__7037a625-d650-4574-b1d5-874d90ba82a4.json
policy:
changedFiles:
  - _t.mjs
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/project/project_paths.js
  - desktop/src/project/project_paths.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - shared/project_config_defaults.d.mts
  - shared/project_config_defaults.mjs
after: 906cff2c-d23c-4647-bc78-2cb5580125e2
---
seems that we have some duplicate stuff in [action\_scheduler\_service.js](desktop/src/actions/action/action_scheduler_service.js),  `DEFAULT_DIAGRAM_FOOTER` is already outdated.

we need to remove duplications and perhaps clean up this file a little.

## Current state

The duplication is a symptom. The cause is that `ActionSchedulerService` has accumulated three unrelated responsibilities, only one of which is scheduling.

**Responsibility 1 — scheduling (correct).** Register, cancel, reconcile and fire timed action schedules, persisted in `<actionsFolder>/.md2-schedules.json`. For this the scheduler needs exactly one project-derived value: `actionsFolder`. It uses it to load and save the schedules file, and to recognise its own file in watcher events (`handleProjectChange`, `action_scheduler_service.js:143`).

**Responsibility 2 — reading and interpreting project config (wrong).** `loadProjectPaths` (`action_scheduler_service.js:232-277`) loads `.md2/config` through `localGitService.loadProjectConfig`, applies six defaults, validates four of them, and joins each onto `projectFolder`. Of the six values produced, the scheduler consumes only `actionsFolder`. `projectFolder` is stored in a field and never read again. `releasesFolder`, `activeCardsFolder`, `diagramsFolder` and `diagramFooter` are pure pass-through.

**Responsibility 3 — bootstrapping the action runner (wrong).** `startProject` (`action_scheduler_service.js:72-86`) forwards those six values to `actionRunnerService.startProject`. That line is the only call site of the runner's `startProject` anywhere in the desktop process. The bridge never starts the runner: `activateProject` in `desktop/src/shell/local_bridge_dispatch.js:99` calls `actionSchedulerService.startProject(project)` and nothing more. So the runner's project lifetime is nested inside the scheduler's, purely as an artifact of wiring order.

Two consequences follow from responsibilities 2 and 3.

**The config file is read twice per project activation.** The scheduler reads it for paths (`action_scheduler_service.js:233`); the runner reads the same file again in `initializeProject` (`action_runner_service.js:104`) to get `states`. Two code paths, two sets of fallbacks, one file.

**The defaults drifted, and the drift is invisible.** Because the scheduler owns the runner's defaults, they live in the desktop process as private copies of constants that also exist in `app/src/data/data_types.ts`:

* `DEFAULT_DIAGRAM_FOOTER` (`action_scheduler_service.js:7`) versus `app/src/data/data_types.ts:21`. The footer is the instruction block appended to a diagram agent's prompt, telling it what JSON to write, and both copies are fallbacks used when a project config has no `diagramFooter` key. The app copy is a structured multi-line contract beginning "Save exactly one valid JSON object to `{{diagram-file}}`. Write JSON only: no SVG, markup, Markdown code fence, or explanatory text", followed by labelled sections for required root fields, optional root fields, diagram types, roles and node kinds. The desktop copy is an older single line beginning "Use the diagram skill as design guidance. Save one version 1 JSON object to `{{diagram-file}}`; do not create SVG or markup". Which one an agent receives depends on which code path resolved the config: an action started from the UI gets the app copy, the same action fired by the scheduler's timer gets the desktop copy.
* Five folder constants (`action_scheduler_service.js:5-10`) versus `app/src/data/data_types.ts:14-20`. Two have diverged: `DEFAULT_PROJECT_FOLDER` is the empty string in desktop and `design` in the app; `DEFAULT_RELEASES_FOLDER` is `releases` in desktop and `history` in the app. The values for actions, diagrams and working folder agree.
* `normalizeFolderPath` and `resolveProjectFolderPath` (`action_scheduler_service.js:46-55`) are character-for-character equal to `normalizeFolderPath` and `joinProjectFolderPath` (`app/src/data/data_types.ts:572-580`), modulo semicolons.

**Smaller cleanups in the same file.** The expression `this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder())` appears verbatim four times (lines 126, 158, 201, 227). `loadProjectPaths` ends in two object literals differing only in how `actionsFolder` is computed. `handleProjectChange` re-implements slash normalization inline instead of calling the helper defined 100 lines above it. `module.exports` (line 295) re-exports `loadActionDefinitions`, which the file imports at line 1 and never uses; `desktop/main.js:24` is the module's only importer and destructures `ActionSchedulerService` only.

**External surface of the scheduler**, all of which must keep working: `startProject`, `handleProjectChange`, `cancelActionSchedule` and `registerActionSchedule` called from `local_bridge_dispatch.js` (lines 99, 305, 128 and 503), and `stop` called from `desktop/main.js:352`.

## Implementation details

The bridge already owns project activation — `activateProject` starts `worktreeService` and refreshes `agentRunnerService` there. So the bridge is where the config gets read, once, and where each service is handed what it needs. This was chosen over having the runner resolve its own paths, because that would leave the scheduler's startup dependent on the runner's.

**1. New `shared/project_config_defaults.mjs`, with a hand-written `shared/project_config_defaults.d.mts`** — matching the `.mjs` plus `.d.mts` convention every other file in `shared/` follows. The desktop process is CommonJS and already requires ESM from `shared/` (`action_scheduler_service.js:1`); the app already imports from it (`data_types.ts:5`). Exports, as the single source of truth:

* `DEFAULT_ACTIONS_FOLDER`, `DEFAULT_ARCHIVED_FOLDER`, `DEFAULT_DIAGRAMS_FOLDER`, `DEFAULT_PROJECT_FOLDER`, `DEFAULT_RELEASES_FOLDER`, `DEFAULT_WORKING_FOLDER`, `DEFAULT_DIAGRAM_FOOTER` — values taken verbatim from `app/src/data/data_types.ts`, which is the newer side of every divergence.
* `normalizeFolderPath(folderPath)` and `joinProjectFolderPath(projectFolder, folderPath)`, moved verbatim from `data_types.ts:572-580`. The desktop name `resolveProjectFolderPath` disappears.

**2. `app/src/data/data_types.ts`** — delete the seven constant definitions and the two local helpers, import them from the shared module, and re-export the constants under their existing names. `config_entries.ts`, `use_working_folder.ts` and the app tests then need no edit. `resolveProjectConfigPaths` and `DEFAULT_PROJECT_CONFIG` keep their bodies, now referencing the imported symbols. No app behavior changes; this is a pure move of definitions.

**3. New `desktop/src/project/project_paths.js`** — exports one pure function, `resolveProjectPaths(config)`, with no I/O and no service. It receives an already-loaded project config object and returns `{ actionsFolder, activeCardsFolder, diagramFooter, diagramsFolder, projectFolder, releasesFolder }`. The body is `loadProjectPaths` minus its first line: same defaults, same four validations (`Invalid project releasesFolder`, `Invalid project diagramsFolder`, `Invalid project workingFolder`, `Invalid project actionsFolder`) and the same `Invalid project diagramFooter: requires {{diagram-file}} placeholder` check, with constants and the join helper now coming from the shared module. The two trailing object literals collapse into one: resolve `actionsFolder` into a local first — validate `config.actionsFolder` only when it is not `undefined`, otherwise use `DEFAULT_ACTIONS_FOLDER` — then call `joinProjectFolderPath` once and return a single literal.

Because the constants now come from the app side, the desktop fallbacks change: a config with no `projectFolder` resolves under `design/` rather than the repository root, and one with no `releasesFolder` resolves `design/history` rather than `releases`. This is deliberate. The app is what writes and edits project configs, so its defaults are the ones a user sees in the config editor, and a desktop path that disagrees with them is a bug either way.

**4. `desktop/src/shell/local_bridge_dispatch.js`, in `activateProject`** — replace the single `actionSchedulerService.startProject(project)` call with an explicit three-step startup: load the config through `localGitService.loadProjectConfig(project)`, call `resolveProjectPaths(config)`, then start the runner with the resolved paths and the config's `states`, then start the scheduler with `project` and `paths.actionsFolder`. Start the runner before the scheduler: the scheduler reconciles timers during its own `startProject`, and a timer that fires calls into the runner. Guard both calls the way the existing code guards `actionSchedulerService`.

**5. `desktop/src/actions/action/action_scheduler_service.js`** — delete the six constants, `normalizeFolderPath`, `resolveProjectFolderPath`, `loadProjectPaths`, the `projectFolder` field and its two assignments, the `loadActionDefinitions` require and its re-export. Then:

* `startProject(project, actionsFolder)` validates both arguments, stores them, and calls `reconcile()`. It no longer touches `localGitService.loadProjectConfig` and no longer calls the runner. After this change the scheduler has no config knowledge at all.
* `requireActionsFolder()` becomes a synchronous getter that throws when the scheduler was never started, so the four repeated load expressions collapse into one private `loadSchedules()` method returning `this.localGitService.loadActionSchedules(this.requireCurrentProject(), this.requireActionsFolder())`, called from `cancelActionSchedule`, `loadSchedulesForReconcile`, `findPendingSchedule` and `findRunningSchedule`.
* `handleProjectChange(event)` returns early when `this.actionsFolder` is null rather than throwing. The bridge registers the watcher independently of activation (`local_bridge_dispatch.js:305`), so an event can arrive before `startProject`; today the lazy config load hid that. It then uses `normalizeFolderPath(actionsFolder)` from the shared module instead of the inline replace chain. Note the deliberate semantic change: the inline version strips only trailing slashes, the helper strips leading ones too, which is the stricter and correct reading for a project-relative folder.
* `stop()` drops its `this.projectFolder = null` line.

**6. `desktop/src/actions/action/action_runner_service.js`** — `startProject(project, paths, states)` replaces the seven positional parameters. It destructures `paths` into the fields it already keeps, and validates `states` the way `initializeProject` does today, throwing the same `Invalid project states` and `Invalid project state` errors. `initializeProject` stops calling `loadProjectConfig` and only awaits `actionDefinitionCache.startProject`, which removes the duplicate config read. The per-value type validations at lines 78-83 move out to `resolveProjectPaths`; the runner keeps its "was I started" assertions at lines 358-367 unchanged. Also delete the duplicated field initialisations in the constructor: `diagramFooter`, `diagramsFolder` and `latestDiagramTimestampMs` are each assigned twice (lines 62-64 and 71-73).

**7. Tests.**

* New `desktop/src/project/project_paths.test.mjs` receives the config and defaults cases currently in `action_scheduler_service.test.mjs` (roughly lines 190-270), with the corrected default expectations, and with the footer case asserting equality against the shared constant rather than substrings. Equality is what stops the constant drifting again.
* `action_scheduler_service.test.mjs` loses those cases and its `loadProjectConfig` mock; its `startProject` calls pass an `actionsFolder` argument directly. What remains is scheduling behavior.
* `action_runner_service.test.mjs` reshapes its `startProject` call sites to the new `(project, paths, states)` signature.
* The `local_bridge_dispatch` tests cover the new activation order: config loaded once, runner started, then scheduler.

No IPC surface, no persisted-file format and no config schema changes.

## Acceptance criteria

1. `action_scheduler_service.js` contains no reference to `loadProjectConfig`, no folder or footer default constants, no path helpers and no `projectFolder` field. Its only project-derived input is the `actionsFolder` passed to `startProject`.
2. `action_scheduler_service.js` does not call `actionRunnerService.startProject`. The bridge's `activateProject` starts the runner and the scheduler as two separate calls, runner first.
3. `.md2/config` is read once per project activation: `localGitService.loadProjectConfig` has exactly one call site on the activation path, in `activateProject`.
4. `DEFAULT_DIAGRAM_FOOTER` and the six folder defaults are each defined exactly once in the repository, in `shared/project_config_defaults.mjs`. `app/src/data/data_types.ts` re-exports them, so no existing app import path changes.
5. `normalizeFolderPath` and the project-folder join helper exist once each, in the shared module. `resolveProjectFolderPath` no longer exists anywhere in `desktop/`.
6. A scheduled diagram action running against a project config with no `diagramFooter` receives the same footer text as the same action started from the UI. A test asserts equality between the resolved footer and the shared constant, not a substring match.
7. Given a config that omits `projectFolder` and `releasesFolder`, `resolveProjectPaths` returns `projectFolder: 'design'`, `actionsFolder: 'design/actions'`, `releasesFolder: 'design/history'`, `diagramsFolder: 'design/diagrams'` and `activeCardsFolder: 'design/active'`. Explicit config values still win over every default.
8. The existing `Invalid project releasesFolder`, `Invalid project diagramsFolder`, `Invalid project workingFolder`, `Invalid project actionsFolder`, `Invalid project states`, `Invalid project state` and `requires {{diagram-file}} placeholder` errors still throw for the same inputs, from `resolveProjectPaths` or the runner respectively.
9. `handleProjectChange` returns without throwing when a watcher event arrives before the scheduler was started.
10. `action_scheduler_service.js` has one call site for loading the current project's schedules, and no longer requires or re-exports `loadActionDefinitions`. `desktop/main.js` still constructs and stops the scheduler unchanged.
11. Registering, cancelling, firing and reconciling schedules behave exactly as before, including a schedule that fires while its project is open and one cancelled mid-run.
12. `npm run typecheck` passes, and the `desktop/` and `app/` test suites pass.
