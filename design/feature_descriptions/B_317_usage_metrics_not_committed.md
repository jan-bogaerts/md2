---
author: 
id: B_317
internalId: 35e2668b-44b4-4be8-9a82-cc3c7f2b4003
title: usage_metrics not committed
status: ready
owner: 
affects:
agents:
  - design/activity/card__35e2668b-44b4-4be8-9a82-cc3c7f2b4003.json
policy:
changedFiles:
  - desktop/main.js
  - desktop/src/actions/agent/usage_metrics_service.js
  - desktop/src/actions/agent/usage_metrics_service.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
---

we update [usage\_metrics.csv](design/usage_metrics.csv) on a regular basis in the project. but it does not seem to use the [commit\_batcher.ts](app/src/data/commit_batcher.ts) for committing the file?

## Current state

* The desktop `UsageMetricsService` (`desktop/src/actions/agent/usage_metrics_service.js`) appends rows to `<projectFolder>/usage_metrics.csv`:
  * `token_usage` rows after each agent turn (`recordTokenUsage`, called from `agent_runner_service.js` and `agent_streaming_event_handlers.js`).
  * `account_usage` rows whenever the Claude or Codex rate-limit snapshot changes (`recordAccountUsage`). The Claude usage poll repeats every `AGENT_USAGE_POLL_TICK_MS` (2 minutes), so these rows are written even when no agent runs.
* After each append, `appendRecords` only calls `uncommittedProjectWrites.mark(rootPath, [filePath])`. Nothing notifies the renderer and nothing schedules a commit.
* `uncommittedProjectWrites.commit(rootPath)` runs only inside `integrateWorktree` and `continueMergeConflict` in `desktop/src/shell/local_bridge_dispatch.js`. Result: the file stays modified in the primary worktree until the next worktree integration. Projects that do not integrate worktrees never commit it.
* Other desktop-written files already reach Git differently:
  * activity files and the token usage summary are committed directly by the desktop (`commitTrackedPaths` in `project_agent_token_usage.js`);
  * conversation view state is committed through the renderer `CommitBatcher`: `agent_acknowledgement_service.ts` calls `DataService.scheduleRepositoryPathCommit(path, message)`, which queues a `kind: 'path'` change. At flush time, the desktop `commit` in `project_files.js` stages that path as it is on disk and commits it together with the rest of the batch. A path that no longer exists is skipped.
* Every `CommitBatcher` flush reaches the desktop through the `commit` handler in `desktop/src/shell/local_bridge_dispatch.js`, which calls `localGitService.commit(request, currentLocalProject)` and ends in `commitNow` in `desktop/src/project/project_files.js`. `commitNow` writes and stages `files` and `moves`, stages each entry of `paths` as it is on disk (a missing path is skipped), and then calls `commitStagedChanges`. `commitStagedChanges` does nothing when nothing is staged.

## Implementation details

Goal: `usage_metrics.csv` never gets a commit of its own. It is added to commits that already happen. Each time the desktop commits a `CommitBatcher` flush for the active primary project, it also stages the usage metrics file. If the file is unchanged, `git add` stages nothing and the commit contains only the batch.

### Desktop

* `UsageMetricsService`: add `repositoryPath(rootPath)`. It returns the CSV path relative to the repository root, with forward slashes (for example `design/usage_metrics.csv`). It returns `null` when no project is active or when `rootPath` is not the bound project root (compare with `projectKey` from `project_operation_coordinator`). The absolute path is already stored in `this.filePath` by `startProject`.
* `local_bridge_dispatch.js`, `commit` handler: before calling `localGitService.commit`, add `usageMetricsService.repositoryPath(currentLocalProject.rootPath)` to `request.paths` when it is not `null`. Build the new request as one object, for example `{ ...request, paths: [...(request.paths ?? []), usageMetricsPath] }`. The commit message is not changed.
* `desktop/main.js`: pass `usageMetricsService` into `createLocalBridgeDispatch`.
* Keep `uncommittedProjectWrites.mark(...)` in `appendRecords`. When no batcher commit happens before the next worktree integration, the integration still commits the file. When a batch already committed it, `commitTrackedPaths` finds no staged changes and does nothing.
* No change in the app, in `CommitBatcher`, or in the direct activity commits (`commitTrackedPaths` in `project_agent_token_usage.js` and `activity_files.js`).

### Edge cases and side effects

* No usage metrics commits while nothing else is committed: rows written by the 2-minute account usage poll wait for the next batch commit or integration.
* An append that runs while a commit is staging: `appendRecords` runs inside `projectOperationCoordinator.run(rootPath, ...)` and `commit` runs inside `holdProjectMutation`, which uses the same coordinator. They cannot overlap, so a commit contains only complete rows.
* The file does not exist yet: `commitNow` skips the missing path.
* Worktree commits (`commitWorktree`) and integration are separate handlers and are not changed. The usage metrics file only lives in the primary worktree.
* Remote-control clients flush through the same desktop `commit` handler, so their commits also carry the file.

### Tests

* `desktop/src/actions/agent/usage_metrics_service.test.mjs`: `repositoryPath` returns the relative path for the bound root, and `null` for another root or before `startProject`.
* `desktop/src/shell/local_bridge_dispatch.test.mjs`: `commit` adds the usage metrics path to `request.paths` next to existing paths, and leaves the request unchanged when `repositoryPath` returns `null`.

## Acceptance criteria

* `usage_metrics.csv` is never committed on its own: no new commit is created just because rows were appended.
* When the commit batcher commits other changes of the primary project, pending `usage_metrics.csv` changes are part of that same commit, with the batch's commit message.
* A batch commit while `usage_metrics.csv` is unchanged contains only the batch files.
* The next worktree integration still commits the file if no batch commit happened before it.
* The CSV content and format do not change.
* The new desktop tests pass, and lint passes in `desktop`.