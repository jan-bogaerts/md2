---
author: 
id: F_401
internalId: a5e97d32-66be-4cf7-9999-c125753f446d
title: add placeholder for actions folder
status: ready
owner: 
affects:
agents:
  - design/activity/card__a5e97d32-66be-4cf7-9999-c125753f446d.json
policy:
after: 1deced87-bdc6-46cb-9360-356355f1675d
---

add a placeholder for the 'actions folder'. Similar like the `repository folder` or `this card` placeholders, but this is for the folder that contains all the actions. Behaves like other placeholders for folders, so full path.

## Current state

* Action placeholders are resolved only on the desktop side, in `desktop/src/actions/action/action_text.js`. `resolvePlaceholders` takes positional arguments (`text, context, runProject, primaryProject, projectFolder, releasesFolder, activeCardsFolder, extraPrompt, diagramFile, version`). `resolveAgentPrompt` and `resolvePopupPrompt` forward to it.
* Folder placeholders `{{active-cards-folder}}`, `{{project-folder}}` and `{{releases-folder}}` take a repository-relative folder and return `path.resolve(requireRootPath(primaryProject), folder)`. They always resolve under the opened repository (`primaryProject`), also during linked-worktree and sequence runs. Only `{{worktree-folder}}` follows the run checkout.
* The actions folder is already resolved: `resolveProjectPaths` in `desktop/src/project/project_paths.js` returns `actionsFolder` as a repository-relative path that includes `projectFolder` (default `actions`). `ActionRunnerService.startProject` stores it, and `ActionRunnerService.start` passes it into the `ActionRun` snapshot. `ActionRun` stores `this.actionsFolder` but never passes it to a resolver.
* Resolver call sites, all needing the new placeholder:
  * `executeCommandAction` in `action_command_executor.js`, fed by `ActionRun.executeCommandAction`.
  * `ActionAgentExecutor.execute` in `action_agent_executor.js`: three calls (diagram prompt override, popup prompt override, root prompt), fed by the `input` object built in `ActionRun.executeAgentAction`.
  * `ActionRunnerService.prepareActionPrompt` (prompt preview before the run starts).
  * `ActionRun.resolveActiveAgentPrompt` (follow-up prompts sent to a running agent).
* The diff command (`project.diffCommand`) has its own resolver: `generateDiff` in `desktop/src/git/diff_service.js` with `DIFF_PLACEHOLDER_NAMES`. The app builds the `DiffRequest` in `app/src/services/data/diff_service.ts` from `resolveProjectConfigPaths`, which already returns a project-folder-joined `actionsFolder`. `DiffRequest` (`app/src/data/electron_action_bridge.ts`) has no `actionsFolder`. The preload and `local_bridge_dispatch.js` pass the request through unchanged.
* The prompt editor typeahead and toolbar list placeholders from `ACTION_PROMPT_PLACEHOLDERS` in `app/src/data/action_placeholders.ts`.
* `app/src/services/actions/action_text.ts` is a stale copy of the desktop resolver. Only its own test `action_text.node.test.ts` imports it; no production code uses it.
* User docs list placeholders in `docs/actions/placeholders.md`, `docs/README.md`, `docs/guide/configuration.md` and `docs/guide/git-and-commits.md`. The `project.diffCommand` description in `app/src/services/config/config_entries.ts` lists the diff placeholders.

## Implementation details

### Placeholder

* Name: `{{actions-folder}}`. Value: absolute path to the configured actions folder under the opened repository, `path.resolve(requireRootPath(primaryProject), actionsFolder)`. Same rule as `{{releases-folder}}`, so it does not follow the linked worktree.
* Missing or empty `actionsFolder` throws `Cannot resolve actions-folder placeholder without a configured actions folder`, before the process starts.

### Desktop action resolver

* `action_text.js`: add `actions-folder` to `PLACEHOLDER_NAMES`. Add an `actionsFolder` parameter directly after `releasesFolder` in `resolvePlaceholders`, `resolveAgentPrompt` and `resolvePopupPrompt`, and add the resolving branch.
* Pass the value at every call site listed above:
  * `ActionRun.executeCommandAction` and `ActionRun.executeAgentAction`: add `actionsFolder: this.actionsFolder` to the input objects.
  * `executeCommandAction` and the three `ActionAgentExecutor.execute` calls: pass `input.actionsFolder`.
  * `ActionRunnerService.prepareActionPrompt`: pass `this.actionsFolder`.
  * `ActionRun.resolveActiveAgentPrompt`: pass `this.actionsFolder`.
* No new config, path resolution or validation: `resolveProjectPaths` already validates `actionsFolder`.

### Diff command

* `diff_service.js`: add `actions-folder` to `DIFF_PLACEHOLDER_NAMES` and resolve it in `generateDiff` from `request.actionsFolder` like `releases-folder` (`path.resolve(rootPath, request.actionsFolder)`, `null` when missing, so `resolveDiffCommand` fails with `Missing diff command value: actions-folder` only when the template uses it).
* `DiffRequest`: add `actionsFolder: string`.
* `app/src/services/data/diff_service.ts`: take `actionsFolder` from `resolveProjectConfigPaths` and send it in the request.

### App

* `action_placeholders.ts`: add `'actions-folder'` to the `name` union and an entry `{ description: 'Absolute path to the configured actions folder.', name: 'actions-folder' }` next to the other folder placeholders.
* `config_entries.ts`: add `{{actions-folder}}` to the `project.diffCommand` description.
* Delete the dead code `app/src/services/actions/action_text.ts` and `app/src/services/actions/action_text.node.test.ts`.

### Docs

* `docs/actions/placeholders.md`: add the `{{actions-folder}}` row. Add it to the note that lists placeholders staying under the opened repository during linked-worktree actions. Change "the same five folder placeholders" to six.
* Add `{{actions-folder}}` to the placeholder lists in `docs/README.md`, `docs/guide/configuration.md` and `docs/guide/git-and-commits.md`.

### Edge cases

* `projectFolder` set: `actionsFolder` already contains it, so the result is `<repository>/<projectFolder>/<actionsFolder>`.
* Linked worktree or sequence checkout: resolves to the opened repository, not the checkout. Matches where action definitions are loaded from.
* Prompt preview (`prepareActionPrompt`) resolves the placeholder too, so the popup shows the absolute path.
* Unknown placeholders are left untouched today; that behavior does not change.

### Tests

* `desktop/src/actions/action/action_text.test.mjs`: update all calls for the new parameter; add resolution of `{{actions-folder}}` (with and without `projectFolder` in the path) and the missing-folder error.
* `action_command_executor.test.mjs`, `action_agent_executor.test.mjs`, `action_runner_service.test.mjs`: extend the existing all-placeholders cases with `{{actions-folder}}` and its expected absolute path.
* `desktop/src/git/diff_service.test.mjs`: resolve `{{actions-folder}}` and fail with `Missing diff command value: actions-folder` when the template uses it without a value.
* `app/src/components/editor/placeholders/markdown_placeholder_toolbar_control.grouped.test.tsx`: assert the `actions-folder` menu item is offered.
* `app/src/services/data/diff_service.node.test.ts`: assert `actionsFolder` is sent in the diff request.
* Run the affected test files directly and `npm run lint` in `app` and `desktop`.

## Acceptance criteria

* `{{actions-folder}}` in an agent prompt, command, popup prompt or follow-up prompt resolves to the absolute path of the configured actions folder under the opened repository.
* With `projectFolder` configured, the path includes the project folder.
* During linked-worktree and sequence runs, `{{actions-folder}}` still points to the opened repository's actions folder.
* `{{actions-folder}}` in `project.diffCommand` resolves to the same absolute path.
* The prompt editor typeahead and toolbar offer `actions-folder` with its description.
* A missing actions folder value fails with a clear error before any process starts.
* `app/src/services/actions/action_text.ts` and its test are removed; nothing else references them.
* User docs and the `project.diffCommand` description list `{{actions-folder}}`.
* Focused tests and lint pass in `app` and `desktop`.