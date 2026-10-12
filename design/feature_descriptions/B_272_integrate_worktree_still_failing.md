---
author: 
id: B_272
internalId: 03ba1df1-2c57-4c20-b3f8-cfff40547b34
title: integrate worktree still failing
status: ready
owner: 
affects:
agents:
  - design/activity/card__03ba1df1-2c57-4c20-b3f8-cfff40547b34.json
policy:
after: 55646f70-22ca-4ed7-a4b6-d2e0276d1923
changedFiles:
  - design/architecture/data_saving_and_commits.md
  - desktop/src/actions/action/action_files.js
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/activity/activity_files.test.mjs
  - desktop/src/actions/agent/usage_metrics_service.js
  - desktop/src/actions/agent/usage_metrics_service.test.mjs
  - desktop/src/git/worktree_service.js
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
  - desktop/src/project/uncommitted_project_writes.js
  - desktop/src/project/uncommitted_project_writes.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
---
still getting this error:

> Primary worktree changed after pending saves were flushed; save changes and retry integration

the sequence is still not ok. we looked at this before. please think long and hard about this one. The solution here is not to flush multiple times but to not change any files after committing and wait until the entire process is done.

## Current state

Terms:

* primary worktree: the opened project checkout (`project.rootPath`), target of the squash integration.
* project lock: `projectOperationCoordinator.run(rootPath, …)` (`desktop/src/project/project_operation_coordinator.js`). It runs operations for one repository root one at a time. Today only `integrateWorktree` / `continueMergeConflict` (`desktop/src/shell/local_bridge_dispatch.js`) and usage-metrics appends use it.
* index lock: `withGitIndexMutation(s)` (`desktop/src/git/git_index_coordinator.js`). It serializes Git index use, not file writes.
* desktop write: a file write the desktop makes into the primary worktree on its own initiative, outside a renderer save.
* renderer save: a renderer request that the desktop writes and commits (`commit`, `deleteFile`, `deleteFolder`, `moveFiles`, `saveProjectConfig`, `createProject` in `desktop/src/project/project_files.js`). Pending content lives in renderer memory (`CommitBatcher`, editor and action drafts) until it is sent.

Sequence today (`integrateCardWorktree` / `integrateProjectWorktree` in `app/src/services/project/worktree_service.ts`):

1. Renderer runs the save barrier `projectPersistenceService.flushPendingChanges()`. It commits renderer-owned changes only.
2. IPC `integrateWorktree` takes the project lock, calls `usageMetricsService.flushPendingChanges()` (commits `usage_metrics.csv` only), then `worktreeService.integrate()`.
3. `integrate()` takes the index lock and calls `requireCleanPrimaryForIntegration()`. Any dirty file throws `Primary worktree changed after pending saves were flushed; save changes and retry integration`.
4. On success, `finalizeIntegrationRepository` cleans up the branch inside the project lock. After the lock is released, `recordIntegrationActivity` writes the integration history, and the renderer queues it for a normal commit (`queueIntegratedActivity`).

Cause: desktop writes ignore the project lock, and many never commit.

| Writer | File | Commits? |
| --- | --- | --- |
| `persistConversationCheckpoint` → `upsertActivityConversation` (agent streaming checkpoints, `agent_streaming_event_handlers.js`, `agent_run_interactions.js`) | card/action activity JSON | no |
| `updateActivityConversationViewed`, `splitActivityConversation`, `closeWaitingActivityConversation`, `dismissWaitingActivityConversationQuestions`, `updateCardActionSettings`, `appendActionActivity`, `appendSystemActivity`, `ensureActivityFile`, `compactActivityFiles` (`activity_files.js`) | activity JSON | no |
| `saveActionSchedules` (`action_files.js`) | action schedule file | no |
| `persistInitialCardConversation`, `persistConversationAndProjectUsage` (`agent_conversation_persistence.js`, `project_agent_token_usage.js`) | activity JSON, card, agent token usage summary | yes, after the write, outside the project lock |
| `updateAndCommitActivity` (action activity, sequence `recordIntegration` in `sequence_worktree_execution.js`) | activity JSON | yes, after the write, outside the project lock |

Failure modes:

* stale dirt: a desktop write that never commits (for example, a viewed flag) leaves the primary worktree dirty before integration starts. The renderer barrier does not know the file, so every integration fails until something else commits it. Current `git status` shows this (`design/activity/card__55646f70….json`).
* race: an agent checkpoint, or a write-then-commit writer, writes between step 1 and the clean check in step 3.
* rule violation: renderer saves are atomic under the index lock and never leave dirt, but they ignore the project lock. They can commit between the usage-metrics commit and the squash merge, or during branch cleanup, so files change after the pre-integration commit.

Out of scope: agents running in the primary worktree that edit arbitrary project files during integration, and sequence integration in linked checkouts.

## Implementation details

Goal: the renderer saves once and starts the request. The desktop then makes one commit, and no file in the primary worktree changes until the whole integration process ends.

Sequence after the change:

1. Renderer: `flushPendingChanges()` once, unchanged, then calls `integrateWorktree`. Its role ends there.
2. Desktop takes the project lock. Every later write into the primary worktree waits in memory until release, whether it is a renderer save or a desktop write.
3. Inside the lock, in order: commit tracked desktop writes once; clean check; rebase; squash merge and commit; synchronize the worktree; branch cleanup; write the integration history.
4. Release. Waiting writes run in arrival order.

Changes:

1. Hold renderer saves. In `project_files.js`, wrap `commit`, `deleteFile`, `deleteFolder`, `moveFiles`, `saveProjectConfig` and `createProject` as `projectOperationCoordinator.run(rootPath, () => withGitIndexMutation(rootPath, …))`. The project lock is the outer lock, the index lock the inner one.
2. Hold desktop writes. Change `queueActivityUpdate(filePath, update)` in `activity_files.js` to `queueActivityUpdate(rootPath, filePath, update)`, running `projectOperationCoordinator.run(rootPath, () => <existing per-file queue>)`. Update all callers: the `activity_files.js` functions listed above, `persistInitialCardConversation` and `persistConversationAndProjectUsage`. Wrap `saveActionSchedules` the same way.
3. Track uncommitted desktop writes. Add `desktop/src/project/uncommitted_project_writes.js`, a class with one shared instance. Its state is a map from repository root to a set of relative paths.
   * `mark(rootPath, relativePaths)`: called after each successful held write: `queueActivityUpdate`, `saveActionSchedules`, the summary write in `persistConversationAndProjectUsage`, and `UsageMetricsService.appendRecords`.
   * `commit(rootPath)`: calls `commitTrackedPaths(rootPath, paths, 'Save pending project activity')` once, then clears the committed paths. A failed commit keeps them marked. Already-committed paths are harmless: `commitTrackedPaths` stages them and finds nothing to commit.
4. Integration inside the lock. In `integrateWorktree` (`local_bridge_dispatch.js`), replace `usageMetricsService.flushPendingChanges()` with `uncommittedProjectWrites.commit(rootPath)`. Move `recordIntegrationActivity` inside the lock, after `finalizeIntegrationRepository`. Do the same in `continueMergeConflict`. Remove `UsageMetricsService.flushPendingChanges`: these two are its only callers.
5. No lock inside the lock. The project lock is not reentrant. Code inside it must not call any function wrapped in step 1 or 2. `recordIntegrationActivity` therefore needs an unheld variant: add `appendSystemActivityNow` in `activity_files.js`, using the per-file queue without the project lock, and use it only there. `appendSystemActivity` stays held for other callers.
6. Keep `requireCleanPrimaryForIntegration`. Dirt left after the commit in step 4 is external (user edits, agents editing project files). Change its message to name the dirty paths and drop the "pending saves were flushed" wording.
7. Renderer unchanged: one barrier pass before the request, `queueIntegratedActivity` after it.
8. Update `design/architecture/data_saving_and_commits.md` ("Desktop integration and usage-metrics writes share `ProjectOperationCoordinator`"). The new text: all writes into the primary worktree, renderer saves and desktop writes alike, share the project lock, and integration commits tracked desktop writes once inside it.

Edge cases:

* Renderer saves requested during integration wait. The UI stays responsive and the save state shows `saving` until release.
* Agent streaming handlers await checkpoints, so agent event handling pauses for the integration. The agent process keeps running.
* A failed step inside the lock releases it. Waiting writes then run against whatever state the failure left (same as today's reset to `checkpointCommit`).
* Squash conflict: the lock is released while the primary worktree has unmerged entries. Writes that were waiting land then. `git commit` commits only the index, so they are not part of the squash commit.
* Project switch: map entries for other roots stay untouched and never commit into the new project.

## Acceptance criteria

* An activity file the desktop wrote before integration started (for example, a viewed flag) is committed in the single pre-integration commit, and integration completes.
* An activity write or renderer save requested during integration does not touch the disk until the whole process ends, including branch cleanup and the history write. It succeeds after that.
* Usage metrics and tracked desktop paths are committed in one commit. The renderer barrier runs once. No `git add -A` checkpoint commit is made.
* A primary-worktree file the desktop did not write still blocks integration with an error that names the file.
* Conflict continuation and retry still record exactly one integration history entry.

Tests:

* `uncommitted_project_writes`: marked paths are committed once and then cleared; a failed commit keeps them; already-clean paths cause no error.
* `activity_files`: a write queued during a project-lock operation on the same root runs after that operation resolves; `appendSystemActivityNow` does not wait for the project lock.
* `project_files`: a `commit` requested during a project-lock operation runs after it.
* `local_bridge_dispatch.test.mjs`: integration commits tracked writes once before `worktreeService.integrate`, and records history before releasing the lock. Replace the usage-metrics flush order test (around line 705).
* `usage_metrics_service.test.mjs`: replace the `flushPendingChanges` test with a test that appends mark the metrics path.
* `worktree_service.test.mjs` (line 456): update the expected message.
