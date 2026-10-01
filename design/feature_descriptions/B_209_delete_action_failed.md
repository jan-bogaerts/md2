---
author: 
id: B_209
internalId: ccff9568-68bb-468f-85e7-37d06bd37b59
title: delete action failed
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__ccff9568-68bb-468f-85e7-37d06bd37b59.json
policy:
after: c00ec008-cf20-4fd2-81e2-254b2b400c48
branch: b_209_delete_action_failed
worktree: 3
---
* create new action
* before it is saved as a file and committed, delete it
* system gives error that it can't delete the file and doesn't remove the file from the in memory data

this is wrong: if the file was not yet saved, we should not throw an error that we can't delete the file. if it doesn't exist, just remove it from the in-memory loaded data and make certain that there is no entry in the batch-committer for the file.

## Current state

Creating an action publishes it through `ActionService.saveDefinition` and queues its JSON write in `CommitBatcher`. Until that write commits, the action can appear in the file tree without appearing in `ProjectState`'s loaded files or repository file index. Deleting it calls `CardOperations.deleteFile`, which rejects paths absent from both collections. The action stays visible, and its queued write can still create the file later. Deleting a persisted action instead flushes pending writes and calls storage deletion.

## Implementation details

* In the action file deletion path, identify the action by `ActionDefinition.id` and determine whether its file has reached persistence. For an action that exists only in memory, cancel its pending `CommitBatcher` change by action ID before any flush. Remove its action and draft state, clear related project file state if present, then let the existing workspace handler close its open document and clear selection. Do not call storage deletion or create a repository commit for this case.
* Coordinate with an active batch flush before deciding the file is absent: if the write completes, use the persisted-file deletion path; if it fails and remains pending, cancel the pending creation. Keep unrelated queued changes intact.
* Keep the existing storage deletion and error reporting for persisted files. A missing path with no matching in-memory action remains an error.

## Acceptance criteria

* Creating an action and deleting it before its queued write commits removes it from the file tree, open document, action list, and pending batch. A later flush does not recreate its file; no delete error or repository commit occurs for that action.
* Deleting during an active write leaves no action or file after the operation completes, whether the write succeeds or fails. Other pending changes remain queued.
* Deleting a persisted action still removes its repository file and in-memory state. Storage failures still surface and leave the action available for retry.
* Focused regression tests cover queued-only deletion, deletion during an active flush, and persisted deletion. Run affected tests and app lint.
