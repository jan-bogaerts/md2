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

I created a performance trace while the application was integrating the work-tree into the project. it seems there are a couple of chunks of big activity, with in between most likely waiting on git? note: this run did not give the error, but left the project 'dirty', some file was changed and was not yet saved.



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