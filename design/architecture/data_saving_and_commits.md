# Data saving and commits

MD² separates live editor state from durable repository storage. Editors update application state immediately, while repeatable file edits are coalesced by `CommitBatcher` before they reach a storage backend.

## Batched save flow

```text
Editor change
    ↓
Domain service updates in-memory state
    ↓
CommitBatcher replaces the pending change for that file
    ↓ configured delay or explicit flush
CardOperations marks affected paths as locally in flight
    ↓
StorageService.commit writes one repository commit
    ↓
Optional automatic push
    ↓
Committed files and path changes are reconciled into application state
```

`DataService.init` creates one `CommitBatcher` for the open project. Its delay comes from `react.autoCommitDelayMs`, which defaults to 30 seconds. The timer starts when the first change enters an empty batch. Further changes join that batch without restarting the timer.

Pending changes are keyed by their current persisted path. Repeated edits replace the pending content, so a normal typing sequence writes only the latest version present when the batch flushes. Changes made while a flush is active remain pending and are committed by a later flush.

The batch can contain:

- ordinary file writes in `CommitRequest.files`;
- path replacements in `CommitRequest.moves`, containing the old path, new path, and latest content.

Files and path replacements in the same batch are passed to `StorageService.commit` together. A failed commit leaves the pending changes available for retry.

## Card and Markdown edits

Card body, title, header, ordering, and policy edits update the loaded project files first. `CardOperations.saveFile` then schedules the changed file in the shared batcher.

The batcher is also shared across files. Editing two cards before a flush produces one `CommitRequest` containing both latest file versions and a combined commit message.

## Action edits and filenames

`ActionService` owns action drafts, field validation, graph validation, serialization, and publication to the renderer. Every valid editor change is serialized and offered to `DataService.persistActionFile`; invalid drafts remain in memory and are not scheduled.

Offering a file to persistence does not write it immediately. `DataService.persistActionFile` places it in the shared commit batch, where later keystrokes replace the pending version for the same action.

An action filename follows its current label:

1. Trim and lowercase the label.
2. Replace each run of characters other than ASCII lowercase letters and digits with `-`.
3. Remove leading and trailing `-` characters.
4. Add `.json` under the configured actions folder.
5. If that path belongs to another action, add `-2`, `-3`, and so on.

For example, `Review Feature!` becomes `actions/review-feature.json`.

Filename changes use the same batch as content changes:

- If the old file is persisted, the batch contains one path replacement with the latest JSON.
- If a newly created action has not reached storage yet, changing its label retargets the pending creation. The batch creates only the final filename and does not try to move a nonexistent file.
- Repeated label edits before a flush retain only the final target path and content.
- If typing continues during an active rename commit, the next pending change is rebased from the committed target path.

The action keeps its stable `id`; chains, schedules, execution requests, histories, and conversation logs do not change. After storage confirms the path replacement, `ActionService` re-keys its file, definition, draft, and publication state. `OpenFilesService` replaces the open tab path without changing its position or active state. Markdown prompt history is keyed by project and stable action ID, so a filename change does not reset undo history.

## Flush triggers

`DataService.flushPendingChanges` first flushes valid action drafts into the batch, then flushes the batch to storage. A deleted or invalid action draft blocks the flush until the user repairs, recreates, or discards it.

Pending changes are flushed before operations that require durable current data, including:

- project or branch changes;
- action execution;
- Electron window close confirmation;
- browser unload;
- the workspace becoming hidden;
- window blur while a save is pending.

Closing or switching context awaits the flush where the workflow permits it. Background browser lifecycle handlers report failures and keep the batch pending for retry.

## Save and push state

`SaveStateService` wraps mutating `StorageService` methods and counts active persistence operations. `DataService` also keeps save state active while a commit batch is queued. The global `hasPendingSave` state therefore covers queued batches, active storage calls, and unresolved action drafts.

`hasPendingPush` is separate:

- In automatic push mode, `CardOperations.commitFiles` pushes after a successful batch commit.
- In manual push mode, the storage adapter records the branch as pending until the user pushes it.

A successful local commit followed by a failed push is still a durable local save and remains visible as pending push work.

## Immediate storage operations

Not every mutation uses `CommitBatcher`. Operations that represent an explicit user command or require an immediate repository result call storage directly. Examples include creating cards or folders, deleting files, moving release files, saving project configuration, and saving schedules or worktree configuration.

Callers must flush pending edits before an immediate operation when ordering matters. They must not bypass the batcher for ordinary typing-driven file updates.

## Storage backends

All renderer workflows target the `StorageService` contract:

- Local Electron storage sends `CommitRequest` through the preload bridge. `desktop/src/project/project_files.js` applies all moves and writes, stages them, and creates one Git commit.
- GitHub storage creates blobs for file contents, then creates one tree containing additions, updates, move targets, and null entries for move sources. It creates one pending commit from that tree.
- Remote-control storage forwards the same request to the connected desktop host.

`CardOperations` marks every written path plus both sides of every move as locally in flight. Project watcher events for those paths are classified as local echoes rather than external conflicts.

## Main implementation files

- `app/src/data/commit_batcher.ts`: coalescing, delay, flush serialization, retries, and path-change rebasing.
- `app/src/services/data_service.ts`: batch lifecycle, action persistence gateway, save state, and flushing.
- `app/src/services/card_operations.ts`: file scheduling, storage commits, local in-flight paths, and automatic push.
- `app/src/services/action_service.ts`: action drafts, validation, filename selection, and post-commit path reconciliation.
- `app/src/services/save_state_service.ts`: queued and active save tracking.
- `app/src/data/data_types.ts`: `CommitRequest`, file, move, and storage contracts.
- `app/src/services/github_storage_writer.ts`: GitHub blob, tree, and commit persistence.
- `desktop/src/project/project_files.js`: local file writes, Git moves, staging, and commits.
