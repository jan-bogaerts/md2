---
author: 
id: F_266
internalId: db346664-48c2-4cf0-833c-3c5508a85591
title: include project agent data in release
status: ready
owner: 
affects:
agents:
  - design/activity/card__db346664-48c2-4cf0-833c-3c5508a85591.json
policy:
changedFiles:
  - add_release_tests.py
---
when we do a release, all the project agent's logs and activity data should also be moved into the release folder.

This should be optional through a checkbox on the release dialog

# Current state

* `ReleaseOperations.completeRelease` (`app/src/services/release_operations.ts:134`) archives only card-owned data: the release cards, their assets, and the card activity files found by `findReleaseActivityPaths` (`app/src/data/release_archiving.ts`). All of it moves into `<releasesFolder>/<releaseName>/` in one `storage.commit`.
* Project agent data lives in a single file, `<projectFolder>/activity/project.json` (`projectActivityFileName` in `shared/activity_paths.mjs`). It holds the `conversations` and `records` of every action run with a `project` or `merge-conflict` context. Nothing in the release path touches it today.
* `CompleteReleaseDialog` (`app/src/components/shell/project/complete_release_dialog.tsx`) shows the release name plus the per-branch delete checkboxes. Its "select all" default is persisted in the react preference `react.deleteBranchesAfterRelease` (`app/src/services/config/config_entries.ts`), read and written in `use_project_toolbar_menu_actions.ts`.
* Run blocking during a release is card-scoped only. `acquireReleaseCardLocks` (`desktop/src/actions/action/action_worktree_run_service.js:118`) refuses when a release target card has a running action and then holds a lock per card key. A project-context run gets `cardKey === null` (`action_worktree_run_service.js:193`), so it is neither counted nor locked; runs on cards outside the release are not counted either. `actionRunnerService.runs` (`desktop/src/actions/action/action_runner_service.js:64`) is the only map that holds every in-flight run.
* Release token usage: `releaseUsage` sums the archived card activity files into `summary.releases[releaseName]` of `agent_token_usage.json`. `projectUsage` is a lifetime total that already includes project agent conversations (`desktop/src/actions/agent/project_agent_token_usage.js`), so `releases` is a breakdown, never a subtraction.
* Release stats: `completeRelease` computes them from the pre-move source paths and writes them to `project_stats.json`. On later loads `findStatsSourcePaths` (`app/src/services/stats/project_stats_loader.ts`) only accepts files matching `/^card__[^/]+\.json$/` inside a release folder, so a `project.json` placed there would be ignored; `activity/project.json` is instead read as current activity. `mergeStats` deduplicates by conversation and action identity.

# Implementation details

## Dialog and preference

* Add a checkbox "Include project agent activity" to `CompleteReleaseDialog`, above the branch section.
* Persist its default in a new boolean config entry `react.includeProjectActivityInRelease` (default `false`, `editable: false`, section and source `react`), read with `useConfigValueOrFallback` and written with `configService.setReactPreference` in `use_project_toolbar_menu_actions.ts`, exactly like `react.deleteBranchesAfterRelease`.
* Thread the flag through `onCompleteRelease` → `useProjectToolbarMenuActions.completeRelease` → `projectSessionService.completeRelease` → `ReleaseOperations.completeRelease(releaseName, selectedBranchNames, includeProjectActivity)`.

## No agent may run during a release

This guard applies to every release, not only when the checkbox is ticked.

* Add a desktop query that reports the currently active runs from `actionRunnerService.runs` (run id plus root action label), exposed through `local_bridge_dispatch.js`, `preload.js`, `electron_action_bridge.ts` and `remote_control_storage_service.ts`.
* `completeRelease` calls it first, before `acquireReleaseCardLock`, and fails fast with the running action labels in the message when the list is not empty.
* Keep `acquireReleaseCardLocks` as is: it still blocks new card runs started while the release is in progress.

## Splitting project.json

Unfinished project conversations must stay available in the app, so the file is split instead of moved.

* Load `<projectFolder>/activity/project.json` through `storage.loadTextFile` and parse it with `parseActivityFileForMigration`. If the file does not exist, the option is a no-op.
* Archived conversations are the ones with a terminal status (`completed`, `cancelled`); `queued`, `running` and `waitingForInput` conversations stay behind.
* A record is archived when every conversation it references (`conversationIds` and `rootConversationId`) is archived. A record referencing at least one kept conversation stays behind. A record with no conversation reference is archived.
* Write the archived subset to `<releasesFolder>/<releaseName>/project.json` and the kept subset back to `<projectFolder>/activity/project.json`. Both are `files` entries of the existing release `storage.commit`, not `moves`, because the source file survives.
* When nothing is archivable (no terminal conversation and no archivable record), write neither file.
* The archived file keeps the name `project.json` so `activityOriginFromPath` still recognizes its origin. A collision with an existing release file is impossible because `buildReleaseMoves` already rejects a release whose target folder exists.

## Stats and token usage

* Release stats: compute the archived subset with `calculateActivityStatsFromSources([{ content: archivedContent, path: releaseProjectPath }])` — its content is not on disk yet, so the path-based `calculateActivityStatsOutsideMainThread` cannot see it — and combine it with the card result through the exported `mergeStats` before writing `project_stats.json`.
* Stats discovery: in `findStatsSourcePaths`, accept any release-folder file that `activityOriginFromPath` recognizes instead of requiring `RELEASE_CARD_FILE_PATTERN`, so an archived `project.json` counts as release activity on later loads. Kept conversations remain only in `activity/project.json` and archived ones only in the release folder, so no conversation is counted twice.
* Token usage: extend `releaseUsage` so `summary.releases[releaseName]` also sums the archived project conversations. `projectUsage` stays untouched.

## After the commit

* When project activity was archived, call `dataService.agents.resetLoadedConversations()` next to the existing `projectAgentTokenUsageService.refresh()`, so the project action popup reloads and shows only the kept conversations without an app restart.

# Acceptance criteria

* The complete-release dialog shows an "Include project agent activity" checkbox whose initial state comes from `react.includeProjectActivityInRelease` and whose change is persisted for the next release.
* With the checkbox off, the release output is what it is today and `activity/project.json` is untouched.
* With the checkbox on, `<releasesFolder>/<releaseName>/project.json` holds the terminal project conversations and their records, and `activity/project.json` retains the `queued`, `running` and `waitingForInput` conversations plus every record that references one of them.
* A record whose conversations are split across both sides stays in `activity/project.json`.
* With the checkbox on and nothing archivable, no `project.json` is written into the release folder and `activity/project.json` is not rewritten.
* Completing a release fails with a message naming the running actions when any agent run is active, whether it belongs to a release card, another card, or the project.
* `agent_token_usage.json` `releases[<name>]` includes the archived project conversations' usage; `projectUsage` is unchanged by the release.
* `project_stats.json` `releases[<name>]` includes the archived project conversations and actions; reopening the project reuses or recomputes them without warnings and without double counting a conversation.
* After the release the project action popup lists only the kept conversations, with no app restart.
* Tests cover the split rules in `release_archiving.node.test.ts`, the running-agent refusal plus stats and usage inclusion in `release_operations.service.test.ts`, and the checkbox with its persisted default in `project_dialogs.test.tsx`.