---
author: 
id: F_429
internalId: b2cc61d8-9d79-41d0-b8bb-082a01cb0db4
title: no commit batch after conversation view changed
status: ready
owner: 
affects:
agents:
  - design/activity/card__b2cc61d8-9d79-41d0-b8bb-082a01cb0db4.json
policy:
branch: f_429_no_commit_batch_after_conversation_view_changed
worktree: 1
changedFiles:
  - app/src/data/commit_batcher.test.ts
  - app/src/data/commit_batcher.ts
  - app/src/data/data_types.ts
  - app/src/services/agents/agent_acknowledgement_service.node.test.ts
  - app/src/services/agents/agent_acknowledgement_service.ts
  - app/src/services/data/data_service.ts
  - app/src/services/github/github_storage_writer.node.test.ts
  - app/src/services/github/github_storage_writer.ts
  - design/architecture/data_saving_and_commits.md
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
---

When conversation view changes from 'true' to 'false', it does not seem that the activity log is scheduled for being committed. This should be fixed.

## Current state

* `AgentAcknowledgementService.setViewed` (`app/src/services/agents/agent_acknowledgement_service.ts`) sets the value locally, then calls the bridge method `updateActionConversationViewed`. It runs with `viewed = false` when a run reaches `completed`, `failed` or `waitingForInput` while no chat shows the conversation, and with `viewed = true` when a chat becomes visible.
* The desktop handler (`desktop/src/shell/local_bridge_dispatch.js`) calls `updateActivityConversationViewed` (`desktop/src/actions/activity/activity_files.js`). That function writes the activity file through `queueActivityUpdate`, which only records the path in `UncommittedProjectWrites`. It does not commit.
* `UncommittedProjectWrites.commit` runs only at the start of worktree integration and merge-conflict continuation. Nothing else commits the marked paths.
* Order of events at the end of a run: `persistConversationAndProjectUsage` commits the activity file ("Update card activity"), then the run event is published, then the renderer writes `viewed = false`. That last write lands after the commit, so it stays uncommitted until the next integration or until another run commits the same activity file. Both directions (`true` to `false` and `false` to `true`) are affected.
* Reusing `DataService.queueIntegratedActivity` (load file content in the renderer, schedule it as a `file` change) is unsafe here: the batch would write a content snapshot from scheduling time. A running agent on the same card can write a newer activity version before the flush, and the stale snapshot would overwrite it.

## implementation details

Term used below: **commit-only path** = a repository path the batch stages and commits as it exists on disk at flush time, without the renderer writing content.

* `app/src/data/data_types.ts`: add optional `paths?: string[]` to `CommitRequest` (commit-only paths).
* `app/src/data/commit_batcher.ts`:
  * New change kind `CommitPathChange { kind: 'path'; path: string }`, key `path:${path}`, so repeated view toggles on one activity file coalesce into one pending entry.
  * `commitActiveBatch` puts `path` changes into `request.paths`, not into `files` or `moves`. `hasPendingFile` and `discardPendingFile` match them by `path`.
* `app/src/services/data/data_service.ts`: add `scheduleRepositoryPathCommit(path, message)`, same shape as `scheduleFileCommit`.
* `AgentAcknowledgementService.setViewed`: after `await write(...)` resolves, derive the activity path from `conversation.path` with `parseConversationActivityReference` (`shared/activity_paths.mjs`) and call `dataService.scheduleRepositoryPathCommit(activityPath, 'Update conversation view state')`. Only the originating window schedules; the `onActionConversationViewed` handler in other windows does not. A failed write schedules nothing.
* `desktop/src/project/project_files.js` `commitNow`: for each entry of `request.paths`, validate a non-empty string, resolve with `ensureInsideRoot`, skip it when the file no longer exists, otherwise `git add -- <path>`. The existing `commitStagedChanges` then commits once and is a no-op when nothing changed. `commit` already holds `ProjectOperationCoordinator`, and activity writes run inside the same coordinator, so `git add` never sees a half-written file.
* `app/src/services/project/expected_persistence_storage.ts` and `card_operation_context.ts`: no outcomes and no `recordCurrentContent` for `paths`; the renderer writes nothing.
* `app/src/services/github/github_storage_writer.ts` `commit`: throw a clear error when `request.paths` is non-empty. View-state writes require the Electron or remote-control bridge, so GitHub never receives it in practice.
* `UncommittedProjectWrites` stays unchanged. The path stays marked; the integration commit for it becomes a no-op.
* Update `design/architecture/data_saving_and_commits.md` to describe commit-only paths.
* Tests:
  * `commit_batcher.test.ts`: a `path` change goes into `request.paths`; two schedules for one path give one entry; a failed flush restores it.
  * `agent_acknowledgement_service` test: a successful write schedules the activity path for both `true` and `false`; a failed write schedules nothing.
  * `project_files` test: a commit-only path is staged and committed with the on-disk content; a missing path is skipped.
  * `github_storage_writer` test: a request with `paths` is rejected.

## acceptance criteria

* After a run ends and its conversation turns unseen (`viewed` from `true` to `false`), the activity file change is committed by the next commit batch flush (`react.autoCommitDelayMs` or an explicit flush such as window blur, close or branch change).
* Opening a chat (`viewed` from `false` to `true`) is committed the same way.
* Several view toggles on the same activity file before a flush produce one commit entry for that file.
* The committed activity file content is the content on disk at flush time; newer agent writes made after scheduling are not overwritten.
* A failed view-state write schedules no commit.
* An activity file deleted before the flush does not block or fail the batch.