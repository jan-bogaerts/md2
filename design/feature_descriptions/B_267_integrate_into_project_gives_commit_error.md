---
author: 
id: B_267
internalId: a0d1eee2-1989-41e0-800d-9667640d35b2
title: integrate into project gives commit error
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__a0d1eee2-1989-41e0-800d-9667640d35b2.json
policy:
---

every time lately when we merge a worktree back into the main repository (`integrate into project` command), we get this error: `Pending changes remain after flush: file commit batch`

why is this occuring? how to fix?

## Current state

Terms:

* commit batch: `CommitBatcher` (`app/src/data/commit_batcher.ts`) queue of card, action, diagram and file changes, committed together after `project.autoCommitDelayMs` or on explicit flush.
* commit pass: one `CommitBatcher.flush()` call. It takes the queue present at that moment, empties it, then awaits `commitFiles` and, in auto push mode, `pushCommittedFiles`.
* flush barrier: `ProjectPersistenceService.flushPendingChanges()` (`app/src/services/project/project_persistence_service.ts`). Must leave nothing pending before a worktree operation starts.

Causal chain for `integrateCardWorktree` / `integrateProjectWorktree` (`app/src/services/project/worktree_service.ts`):

1. Integration calls the flush barrier through `flushAggregatePendingChanges` (`data_service.ts`).
2. Barrier stages editors and drafts, then runs exactly one commit pass via `dataService.cards.flushPendingCommits()` (`card_operation_context.ts`).
3. Commit pass detaches the queue, then awaits the desktop commit and, with `pushMode: auto`, the GitHub push. This await window lasts from hundreds of milliseconds to seconds.
4. Any `saveCardChange`, `scheduleFileCommit`, `persistActionFile` or `scheduleDiagramCommit` call during that window lands in a new queue. Known writers: card field updates from running actions (`addCardChangedFiles` in `action_run_registry.ts`, agent log references), action draft saves, `onPathCommitted` / `onPersisted` callbacks of the batch itself, editor saves.
5. Same gap when another flush (timer, window blur in `project_workspace.tsx`) is active: `CommitBatcher.flush()` lines 238-240 await that other flush and return without committing changes queued during it.
6. After the single pass, `getPendingSaveBlockers()` sees `commitBatcher.hasPending()` true and throws `Pending changes remain after flush: file commit batch`. Integration aborts before `storage.integrateWorktree`.

The error is not a lost write: the queued change still commits on the next timer flush. Only the barrier gives up too early. It shows more now because integration usually follows agent runs that still write card fields, and auto push lengthens the window.

Not affected: `CommitBatcher.flush()` single-pass semantics are intended and covered by `commit_batcher.test.ts` ("keeps newer content queued when typing continues during a commit", "rebases edits queued while a move is being committed").

## Implementation details

Fix in the flush barrier only; `CommitBatcher` stays single-pass.

`app/src/services/project/project_persistence_service.ts`, `flushPendingChanges`:

* Add constant `MAX_COMMIT_FLUSH_PASSES = 3`.
* Replace the single `if (hasPendingFileCommit) await dataService.cards.flushPendingCommits()` with a bounded `for` loop: per pass, stop when `dataService.getPersistenceSnapshot().hasPendingFileCommit` is false, otherwise `await dataService.cards.flushPendingCommits()`.
* Each pass commits everything queued during the previous pass, so the barrier ends clean unless a writer keeps queueing for all passes.
* Rest unchanged: `drainPendingStorageWrites`, `reconcileSnapshot`, blocker check and error text.

Call sites of `flushPendingChanges` (all want "nothing pending" before continuing, so all receive the new behavior): `worktree_service.ts` (integrate, update), `project_loading.ts`, `project_session_service.ts`, `electron_action_runner.ts`, `action_popup_defaults.ts`, `project_workspace.tsx`.

Edge cases:

* Commit or push fails: `flushPendingCommits` rethrows; loop stops at the first failure, error propagates as today.
* Writer queues on every pass (for example a running agent on the same card): after `MAX_COMMIT_FLUSH_PASSES` the existing `Pending changes remain after flush: file commit batch` error is thrown. Bound is explicit, no unbounded drain.
* Editor edits or action drafts created during the passes are not re-staged; they still surface as named blockers (`card document …`, `action drafts`). Unchanged behavior.

### Tests

`app/src/services/project/project_persistence_service.node.test.ts`:

* Change scheduled while the first commit is pending (deferred `storage.commit`) is committed by a second pass; `flushPendingChanges` resolves; `storage.commit` called twice.
* Writer that schedules a new change on every commit: `flushPendingChanges` rejects with `Pending changes remain after flush: file commit batch`; `storage.commit` called `MAX_COMMIT_FLUSH_PASSES` times.

`app/src/services/data/data_service.service.test.ts`, "keeps one action through incomplete repair and label change during initial persistence":

* Stale expectation: line 379 asserts `initialFlush` rejects with `Pending changes remain after flush`. That rejection was a side effect of the single-pass barrier, not the subject of the test. Update to `await initialFlush` (resolves); remaining assertions on `requests[0]`, `requests[1]` and the single action stay unchanged.

`app/src/services/project/worktree_service.node.test.ts`: no change; flusher is injected.

## Acceptance criteria

* Integrating a card or project worktree while card, action or file changes are queued during the pre-integration commit does not show `Pending changes remain after flush: file commit batch`; integration proceeds after all queued changes are committed.
* Same for worktree update (`updateCardWorktree`, `updateProjectWorktree`).
* `flushPendingChanges` runs at most `MAX_COMMIT_FLUSH_PASSES` commit passes; if changes are still queued after that, it throws the existing error naming `file commit batch`.
* A failing commit or push during the barrier still surfaces its own error and stops the barrier.
* `CommitBatcher.flush()` behavior and its existing tests unchanged.
* Tests above pass.