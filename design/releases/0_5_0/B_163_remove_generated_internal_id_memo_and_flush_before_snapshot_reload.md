---
author: 
id: B_163
internalId: 4aff5203-e00a-42bb-9c0c-55d2a77c2e57
title: remove generated internal id memo and flush before snapshot reload
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__4aff5203-e00a-42bb-9c0c-55d2a77c2e57.json
policy:
after: 1d9ff698-58aa-4f60-bc66-7ae73831af42
---

`CardInternalIdOperations` keeps a per-path memo of internal IDs it generated but has not yet persisted. The memo exists to make repeated identity sweeps produce a stable ID for a path whose write has not reached disk yet. That window should not exist in the first place. Remove the memo and close the window by flushing pending writes before the snapshot is re-read from storage.

Terms used below:

- **pending change**: a file write that has been scheduled on `CommitBatcher` but not yet written to storage. The batcher delays writes by `AUTO_COMMIT_DELAY_MS` (30 seconds, `app/src/data/data_types.ts:20`).
- **flush**: forcing all pending changes to be written to storage immediately, via `flushPendingChanges`.
- **memo**: the `generatedInternalIdsByPath` map described below.

## Current state

`CardInternalIdOperations.ensureCardInternalIds` (`app/src/services/data/card_internal_id_operations.ts:36`) does the following on every call:

- Compares `${project.id}:${project.branch}` against `generatedInternalIdProjectKey`. On a mismatch it clears `generatedInternalIdsByPath` and calls `onProjectChanged`.
- Deletes the memo entry for every card that now has an `internalId`.
- For each card still without an `internalId`, reuses the memo entry for that path if present, otherwise generates a new UUID, then stores it in the memo.
- Applies the ID to the in-memory card through `mutateCard`.
- Schedules a commit **only** for cards whose ID was not already in the memo (`if (!generatedInternalId) cardsToPersist.push(updatedCard)`).

The memo therefore does two things: it makes a second sweep over the same still-unpersisted path reuse the first sweep's ID instead of generating a different one, and it suppresses a duplicate scheduled commit for that path.

Both behaviors only matter while a generated ID exists in memory but not on disk. In that window, any code path that replaces the in-memory file set with content read from storage drops the generated ID, because storage does not have it yet. `ProjectState.replaceProjectFiles` (`app/src/services/project/project_state.ts:93`) is such a path: it assigns `currentFiles = files` outright, unlike `mergeBackgroundProjectFiles` (`app/src/services/project/project_state.ts:105`), which is explicitly written to keep cards already owned by the root snapshot.

`reloadCurrentProjectSnapshot` (`app/src/services/project/project_loading.ts:352`) reads the project from storage, calls `replaceProjectFiles`, and then calls `ensureCardInternalIds`. It has exactly one production caller: the card separator migration, `updateCardSeparator` at `app/src/services/project/project_loading.ts:304`.

`updateCardSeparator` already flushes, but only at the start:

- `app/src/services/project/project_loading.ts:278` calls `flushPendingChanges` before loading the project and planning the renames.
- The rename loop then runs `storage.moveFiles` once per card, awaiting each one. For a large project this is a long-running operation with a progress dialog.
- `app/src/services/project/project_loading.ts:304` calls `reloadCurrentProjectSnapshot` with no second flush.

Anything that schedules a commit during the rename loop is therefore still pending when the snapshot is replaced with storage content, and is silently dropped. The migration itself does not schedule commits, since it writes through `storage.moveFiles` directly, but the application is not idle during it: watcher events, agent runs and identity sweeps for newly appearing files can all schedule commits in that period.

Separately, `onProjectChanged` is wired as `() => this.renames.reset()` (`app/src/services/data/card_operations.ts:73`). `CardRenameOperations.reset` clears `committedPathsByPath` (`app/src/services/data/card_rename_operations.ts:24`), which is rename tracking scoped to the previously open project. This reset currently happens **only** as a side effect of the project-key check inside the identity sweep. Any change to that check must preserve it.

Note on scope: this card assumes the memo is unnecessary once the unpersisted window is closed. The code does not record why the memo was originally added, so this is a deliberate decision to remove it, not a reconstruction of its history.

## Required behavior

- No memo of generated internal IDs is kept between sweeps.
- No code path replaces the in-memory file set with storage content while writes for those files are still pending.
- Rename tracking is still reset when the open project changes.
- The card separator migration produces the same result as today, and no change scheduled during it is lost.

## Implementation details

- Delete `generatedInternalIdsByPath` and `generatedInternalIdProjectKey` from `CardInternalIdOperations`, together with the memo lookup, the memo write, the memo delete loop, and the `if (!generatedInternalId)` condition that guards `cardsToPersist`. Every card that lacks an `internalId` gets a freshly generated one and is scheduled for persistence.
- Move the `onProjectChanged` / `renames.reset()` trigger out of `ensureCardInternalIds`. Resetting rename tracking is a project-lifecycle concern and must not depend on an identity sweep running. Attach it to the point where the open project actually changes, so it still fires when the sweep does nothing or is skipped.
- Add `await this.dependencies.flushPendingChanges()` immediately before `await this.reloadCurrentProjectSnapshot()` in `updateCardSeparator` (`app/src/services/project/project_loading.ts:304`). Keep the existing flush at `:278`; the first one guarantees the rename plan is built from current data, the second guarantees nothing scheduled during the rename loop is discarded by the reload.
- Do not remove the flush at `:278` and do not merge the two into one. They close different windows at different times.
- `flushPendingChanges` resolves to `flushAggregatePendingChanges` (`app/src/services/data/data_service.ts:400`), which is already awaited elsewhere in this file, so no new failure handling is introduced.

## Acceptance criteria

- `generatedInternalIdsByPath` and `generatedInternalIdProjectKey` no longer exist anywhere in the codebase.
- A card without an `internalId` receives one and is scheduled for persistence on the sweep that first sees it.
- Rename tracking is cleared when the open project changes, verified by a test that switches projects without any card needing an internal ID, and asserts that stale rename tracking from the previous project is gone.
- A test covering `updateCardSeparator` asserts that a commit scheduled after the initial flush and before the snapshot reload is written to storage rather than dropped.
- The card separator migration still renames every affected card file and still returns the number of moves performed.
- `npm run typecheck` passes and the existing project loading and card operation tests pass.
