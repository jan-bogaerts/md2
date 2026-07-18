# Data saving and commits

Editors update application state immediately. `CommitBatcher` later coalesces repeatable edits into durable repository writes.

## Batched save flow

```text
Editor change
  → domain service updates in-memory state
  → CommitBatcher replaces that file's pending change
  → configured delay or explicit flush
  → CardOperations marks affected paths as locally in flight
  → StorageService.commit creates one repository commit
  → optional automatic push
  → committed files and path changes are reconciled into application state
```

`DataService.init` creates one batcher per project. The first change starts its `react.autoCommitDelayMs` timer (30 seconds by default); later changes do not restart it. Changes are keyed by persisted path, and repeated edits replace pending content. Edits arriving during a flush form the next batch; failed commits remain pending for retry.

A single `CommitRequest` passes both ordinary writes (`files`) and path replacements (`moves`: old path, new path, and latest content) to `StorageService.commit`.

## Editor behavior

### Cards and Markdown

Card body, title, header, ordering, and policy edits update loaded files, then `CardOperations.saveFile` schedules them. All files share the batcher: editing two cards before a flush produces one request with both latest versions and a combined message.

### Actions and filenames

`ActionService` owns drafts, field and graph validation, serialization, and renderer publication. Each valid change is serialized and scheduled through `DataService.persistActionFile`; later keystrokes replace it. Invalid drafts stay only in memory.

An action's filename follows its label:

1. Trim and lowercase the label.
2. Replace each run of non-ASCII-lowercase-letter-or-digit characters with `-`.
3. Remove leading and trailing `-` characters.
4. Add `.json` under the configured actions folder.
5. If another action owns the path, append `-2`, `-3`, and so on.

For example, `Review Feature!` becomes `actions/review-feature.json`.

Filename and content changes share the batch:

| Situation | Result |
| --- | --- |
| Persisted source | One path replacement containing the latest JSON. |
| New action not yet stored | The pending creation is retargeted; only the final filename is created, with no move of a nonexistent file. |
| Repeated label edits before flush | Only the final target path and content remain. |
| Typing during an active rename | The next pending change is rebased from the committed target path. |

Renaming keeps the action's stable `id`, so chains, schedules, execution requests, histories, and conversation logs do not change. After storage confirms the move, `ActionService` re-keys the file, definition, draft, and publication state. `OpenFilesService` changes the tab path but preserves its position and active state. Prompt history is keyed by project and action ID, preserving Markdown undo history.

## Flushing and state

`DataService.flushPendingChanges` adds valid action drafts, then flushes the batch. Deleted or invalid drafts block it until repaired, recreated, or discarded.

Pending edits flush before operations that need durable current data:

- project or branch changes;
- action execution;
- Electron window-close confirmation;
- browser unload;
- workspace hide;
- window blur while a save is pending.

Close and context-switch workflows await flushing where possible. Background browser handlers report failures and retain the batch for retry.

`SaveStateService` wraps mutating storage methods and counts active operations; `DataService` also tracks queued batches. `hasPendingSave` therefore covers queued batches, active storage calls, and unresolved action drafts.

`hasPendingPush` is independent:

- automatic mode: `CardOperations.commitFiles` pushes after a successful batch commit;
- manual mode: the adapter marks the branch pending until the user pushes.

A push failure after a successful commit remains a durable local save and visible pending-push work.

## Immediate operations

Commands needing an immediate repository result bypass `CommitBatcher`: creating cards or folders, deleting files, moving release files, and saving project, schedule, or worktree configuration.

Callers flush first when ordering matters. Typing-driven updates must use the batcher.

## Storage backends

All renderer workflows use `StorageService`:

| Backend | Commit behavior |
| --- | --- |
| Local Electron | Sends `CommitRequest` through the preload bridge. `desktop/src/project/project_files.js` applies moves and writes, stages them, and creates one Git commit. |
| GitHub | Creates content blobs, then one tree containing additions, updates, move targets, and null entries for move sources; it creates one pending commit from that tree. |
| Remote control | Forwards the same request to the connected desktop host. |

`CardOperations` marks every write and both move paths as locally in flight, classifying their watcher events as local echoes rather than external conflicts.

## Main implementation files

| File | Responsibility |
| --- | --- |
| `app/src/data/commit_batcher.ts` | Coalescing, delay, serialized flushes, retries, and path-change rebasing. |
| `app/src/services/data/data_service.ts` | Batch lifecycle, action persistence gateway, save state, and flushing. |
| `app/src/services/data/card_operations.ts` | File scheduling, storage commits, locally in-flight paths, and automatic push. |
| `app/src/services/actions/action_service.ts` | Action drafts, validation, filename selection, and post-commit path reconciliation. |
| `app/src/services/project/save_state_service.ts` | Queued and active save tracking. |
| `app/src/data/data_types.ts` | `CommitRequest`, file, move, and storage contracts. |
| `app/src/services/github/github_storage_writer.ts` | GitHub blob, tree, and commit persistence. |
| `desktop/src/project/project_files.js` | Local writes, Git moves, staging, and commits. |
