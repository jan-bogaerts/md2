---
author: 
id: B_272
internalId: 03ba1df1-2c57-4c20-b3f8-cfff40547b34
title: integrate worktree still failing
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__03ba1df1-2c57-4c20-b3f8-cfff40547b34.json
policy:
---
still getting this error:

> Primary worktree changed after pending saves were flushed; save changes and retry integration

the sequence is still not ok. we looked at this before. please think long and hard about this one. The solution here is not to flush multiple times but to not change any files after committing and wait until the entire process is done.

## Current state

Terms:

* primary worktree: the opened project checkout (`project.rootPath`), target of the squash integration.
* desktop write: a file write the desktop process makes directly into the primary worktree, outside the renderer `CommitBatcher`.
* integration hold: the `projectOperationCoordinator.run(rootPath, …)` operation that `integrateWorktree` in `desktop/src/shell/local_bridge_dispatch.js` runs. `ProjectOperationCoordinator` (`desktop/src/project/project_operation_coordinator.js`) serializes operations per repository root.
* index lock: `withGitIndexMutation(s)` (`desktop/src/git/git_index_coordinator.js`). It serializes Git index use, not file writes.

Sequence today (`integrateCardWorktree` / `integrateProjectWorktree` in `app/src/services/project/worktree_service.ts`):

1. Renderer runs the save barrier `projectPersistenceService.flushPendingChanges()`. It commits renderer-owned changes only. Renderer commits write and commit inside the index lock (`desktop/src/project/project_files.js`), so they never leave the primary worktree dirty.
2. IPC `integrateWorktree` enters the integration hold, calls `usageMetricsService.flushPendingChanges()` (commits `usage_metrics.csv` only), then `worktreeService.integrate()`.
3. `integrate()` takes the index lock and calls `requireCleanPrimaryForIntegration()`. Any dirty file throws `Primary worktree changed after pending saves were flushed; save changes and retry integration`.
4. After a successful run, `finalizeIntegrationRepository` cleans up the branch. The hold then ends, and `recordIntegrationActivity` writes the integration history. The renderer queues that file for a normal commit (`queueIntegratedActivity`).

Cause: several desktop writes do not take the integration hold, and many never commit:

| Writer | File | Commits? |
| --- | --- | --- |
| `persistConversationCheckpoint` → `upsertActivityConversation` (agent streaming checkpoints, `agent_streaming_event_handlers.js`, `agent_run_interactions.js`) | card/action activity JSON | no |
| `updateActivityConversationViewed`, `splitActivityConversation`, `closeWaitingActivityConversation`, `dismissWaitingActivityConversationQuestions`, `updateCardActionSettings`, `appendActionActivity`, `appendSystemActivity`, `ensureActivityFile`, `compactActivityFiles` (`activity_files.js`) | activity JSON | no |
| `persistInitialCardConversation`, `persistConversationAndProjectUsage` (`agent_conversation_persistence.js`, `project_agent_token_usage.js`) | activity JSON, card, agent token usage summary | yes, only after the write, outside any hold |
| `updateAndCommitActivity` (action activity, sequence `recordIntegration` in `sequence_worktree_execution.js`) | activity JSON | yes, only after the write, outside any hold |

This gives two failure modes:

* stale dirt: a write that never commits (for example, a viewed flag) leaves the primary worktree dirty before integration starts. The renderer barrier does not know about the file, so every integration fails until something else commits it. Current `git status` shows this (`design/activity/card__55646f70….json`).
* race: an agent checkpoint, or a write-then-commit writer, writes between step 1 and the clean check in step 3.

Not affected:

* renderer batch commits. They are atomic under the index lock.
* `usage_metrics.csv` appends. They already run inside the coordinator.

Out of scope: agents running in the primary worktree that edit arbitrary project files during integration, and sequence integration in linked checkouts.

## Implementation details

Goal: one commit, then no file changes in the primary worktree until the integration process ends.

1. Hold every desktop write. Change `queueActivityUpdate(filePath, update)` in `activity_files.js` to `queueActivityUpdate(rootPath, filePath, update)`. It must run `projectOperationCoordinator.run(rootPath, () => <existing per-file queue>)`. Update all callers: the `activity_files.js` functions listed above, `persistInitialCardConversation`, and `persistConversationAndProjectUsage`. Writes requested during an integration then wait in memory and run after the hold ends. Keep the coordinator as the outer lock and the per-file queue as the inner one.
2. Track uncommitted desktop writes. Add `desktop/src/project/uncommitted_project_writes.js`, a class with one shared instance. Its state is a map from repository root to a set of relative paths. It has two methods:
   * `mark(rootPath, relativePaths)`: `queueActivityUpdate` calls it after each successful write. `UsageMetricsService.appendRecords` calls it for the metrics file, and the summary write in `persistConversationAndProjectUsage` calls it for the summary file.
   * `commit(rootPath)`: calls `commitTrackedPaths(rootPath, paths, 'Save pending project activity')` once, then clears the committed paths. If the commit fails, the paths stay marked. Paths that are already committed are harmless: `commitTrackedPaths` stages them and finds nothing to commit.
3. Single pre-integration commit. In `integrateWorktree` and `continueMergeConflict` (`local_bridge_dispatch.js`), replace `usageMetricsService.flushPendingChanges()` with `uncommittedProjectWrites.commit(rootPath)` inside the hold. Remove `UsageMetricsService.flushPendingChanges` because these are its only callers. Keep the renderer barrier exactly as it is (one pass, unchanged).
4. Keep `requireCleanPrimaryForIntegration`. Dirt that is still present after step 3 is external: user edits, or an agent editing project files. Change its message to name the dirty paths and drop the "pending saves were flushed" wording.
5. Deadlock rule: code inside the integration hold must not call any function wrapped by the coordinator. `recordIntegrationActivity` already runs after the hold, so it stays there. It uses `appendSystemActivity`, which becomes held, and it must not move inside.
6. Update `design/architecture/data_saving_and_commits.md` ("Desktop integration and usage-metrics writes share `ProjectOperationCoordinator`"). The new text: all desktop primary-worktree writes share the coordinator, and the integration commits tracked uncommitted desktop writes once.

Edge cases:

* Agent streaming handlers await checkpoints, so agent event handling pauses for the length of an integration. The agent process keeps running, and events are processed after the hold.
* Squash conflict: the hold ends while the primary worktree has unmerged entries. Writes that were held then land as unstaged changes. They are not part of the squash commit, because `git commit` commits only the index.
* Project switch: entries for other roots stay in the map and never commit into the new project.

## Acceptance criteria

* An activity file that the desktop wrote before integration started (for example, a viewed flag) is committed in the single pre-integration commit, and integration completes.
* An activity write requested while integration runs does not reach the disk until integration (including branch cleanup) finishes, and it then succeeds.
* Usage metrics and tracked activity paths are committed in one commit. The renderer barrier is not repeated, and no `git add -A` checkpoint commit is made.
* A primary-worktree file that the desktop did not write still blocks integration with an error that names the file.
* Conflict continuation, retry, and integration history recording keep their current behavior (one history record, written after the hold).

Tests:

* `uncommitted_project_writes`: marked paths are committed once and then cleared; a failed commit keeps them; already-clean paths cause no error.
* `activity_files`: a write queued during a coordinator operation on the same root runs after that operation resolves.
* `local_bridge_dispatch.test.mjs`: integration commits tracked writes once, before `worktreeService.integrate`. Replace the existing usage-metrics flush order test (around line 705).
* `usage_metrics_service.test.mjs`: replace the `flushPendingChanges` test with a test that appends mark the metrics path.
* `worktree_service.test.mjs` (line 456): update the expected message.