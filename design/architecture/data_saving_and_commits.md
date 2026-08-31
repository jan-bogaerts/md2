---
internalId: 965163dc-aad3-4925-981a-71b89a85a633
---

# Data saving and commits

Editors update application state immediately. `CommitBatcher` later coalesces repeatable edits into durable repository writes.

## Batched save flow

```text
Editor change
  → domain service updates in-memory state
  → CommitBatcher replaces that domain object's pending change
  → configured delay or explicit flush
  → renderer registers exact expected present/absent persistence outcomes
  → StorageService.commit creates one repository commit
  → optional automatic push
  → committed files and path changes are reconciled into application state
```

`DataService.init` creates one batcher per project. Every scheduled change restarts one global trailing `react.autoCommitDelayMs` timer (30 seconds by default). This timer policy is unchanged by action identity handling.

Pending cards use `Card.header.internalId`; pending actions use `ActionDefinition.id`; generic files use their path. Keys include change kind, preventing card, action, and file identities from colliding. Card and action paths are mutable persistence metadata.

When flushing starts, `CommitBatcher` synchronously transfers the complete pending collection into an isolated active batch and installs a new empty pending collection. Edits received during persistence enter only the new collection. Active success discards the active batch without object-reference comparison. A successful path change rebases only newer pending source-path metadata for the same identity. Active failure restores entries only when no newer entry for that identity exists.

A single `CommitRequest` passes both ordinary writes (`files`) and path replacements (`moves`: old path, new path, and latest content) to `StorageService.commit`.

## Editor behavior

### Cards and Markdown

Card body, title, header, ordering, and policy edits update loaded files, then `CardOperations.saveFile` schedules them. All files share the batcher: editing two cards before a flush produces one request with both latest versions and a combined message.

### Actions and filenames

`ActionService` owns drafts by action ID, including current source path and desired target path. It also owns field and graph validation, serialization, and renderer publication. Each persistable change passes its action ID through `DataService.persistActionFile`; later committed edits replace pending content for that same ID. Non-persistable drafts stay in memory until repaired or discarded.

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
| New action not yet stored | One path change targets the final filename; storage writes the target even when the source is absent. |
| Repeated label edits before flush | Only the final target path and content remain. |
| Typing during an active rename | The next pending change is rebased from the committed target path. |

Renaming keeps the action's stable `id`, so chains, schedules, execution requests, histories, and conversation logs do not change. After storage confirms the move, `ActionService` re-keys path-indexed file, definition, and publication metadata. Draft and open-document ownership remains on action ID, preserving tab position, active state, and Markdown undo history.

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

Commands needing an immediate repository result bypass `CommitBatcher`: creating cards or folders, deleting files, moving release files, saving project or schedule configuration, and adding or removing Git worktrees.

Callers flush first when ordering matters. Typing-driven updates must use the batcher.

## Storage backends

All renderer workflows use `StorageService`:

| Backend | Commit behavior |
| --- | --- |
| Local Electron | Sends `CommitRequest` through the preload bridge. `desktop/src/project/project_files.js` moves an existing source or writes the target directly when source is absent. A tracked, already-absent source deletion is staged before one Git commit. |
| GitHub | Creates content blobs, then one tree containing additions, updates, move targets, and null entries only for move sources present in the current tree. It creates one pending commit from that tree. |
| Remote control | Forwards the same request to the connected desktop host, which applies local missing-source behavior. |

Renderer persistence tracking registers outcomes before watcher-producing storage calls. Writes expect exact target content; moves expect an absent
source and exact target content; file and known folder descendants expect absence after deletion. Latest outcome owns each normalized repository path.
Operation settlement does not consume outcomes and does not wait for watcher delivery.

Watcher callbacks defer a tracked path while any local operation affecting it remains unresolved, then inspect current persisted state. Exact matches
are local echoes: repository-path bookkeeping may update, but action and Markdown domain state do not reload. Contradictions use existing external
reload and conflict handling. Project/branch replacement discards old-scope outcomes; watcher restoration verifies retained outcomes during full
resynchronization. Local Electron and remote-control storage share this renderer behavior. GitHub storage has no watcher and bypasses tracking.

## Main implementation files

| File | Responsibility |
| --- | --- |
| `app/src/data/commit_batcher.ts` | Coalescing, delay, serialized flushes, retries, and path-change rebasing. |
| `app/src/services/data/data_service.ts` | Batch lifecycle, action persistence gateway, save state, and flushing. |
| `app/src/services/data/card_operations.ts` | File scheduling, storage commits, direct state reconciliation, and automatic push. |
| `app/src/services/project/expected_persistence_outcomes.ts` | Project-scoped expected outcomes, unresolved operations, matching, bounds, and reset. |
| `app/src/services/project/expected_persistence_storage.ts` | Central outcome derivation around watcher-producing storage mutations. |
| `app/src/services/project/project_loading.ts` | Watcher classification, external reload routing, and restoration verification. |
| `app/src/services/actions/action_service.ts` | Action drafts, validation, filename selection, and post-commit path reconciliation. |
| `app/src/services/project/save_state_service.ts` | Queued and active save tracking. |
| `app/src/data/data_types.ts` | `CommitRequest`, file, move, and storage contracts. |
| `app/src/services/github/github_storage_writer.ts` | GitHub blob, tree, and commit persistence. |
| `desktop/src/project/project_files.js` | Local writes, Git moves, staging, and commits. |
