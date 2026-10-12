---
author: 
id: B_267
internalId: a0d1eee2-1989-41e0-800d-9667640d35b2
title: integrate into project gives commit error
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.3/card__a0d1eee2-1989-41e0-800d-9667640d35b2.json
policy:
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/card_view/card_body_popover.tsx
  - app/src/components/config/config_page.test.tsx
  - app/src/components/config/worktree_config_list.grouped.test.tsx
  - app/src/components/hooks/use_worktree_selector_state.ts
  - app/src/components/hooks/use_worktrees.ts
  - app/src/components/worktree_selector.test.tsx
  - app/src/components/worktree_selector.tsx
  - app/src/data/merge_conflict_types.ts
  - app/src/services/data/data_service.service.test.ts
  - app/src/services/data/data_service.ts
  - app/src/services/project/merge_conflict_service.node.test.ts
  - app/src/services/project/merge_conflict_service.ts
  - app/src/services/project/project_persistence_service.node.test.ts
  - app/src/services/project/project_persistence_service.ts
  - app/src/services/project/worktree_service.node.test.ts
  - app/src/services/project/worktree_service.ts
  - design/architecture/data_saving_and_commits.md
  - desktop/main.js
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/agent/usage_metrics_service.js
  - desktop/src/actions/agent/usage_metrics_service.test.mjs
  - desktop/src/git/worktree_service.js
  - desktop/src/git/worktree_service.test.mjs
  - desktop/src/project/project_operation_coordinator.js
  - desktop/src/project/project_operation_coordinator.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
after: 5785f8fc-1509-47f0-8b60-5b34f03774c1
---
every time lately when we merge a worktree back into the main repository (`integrate into project` command), we get this error: `Pending changes remain after flush: file commit batch`

why is this occuring? how to fix?

I created a performance trace while the application was integrating the work-tree into the project. it seems there are a couple of chunks of big activity, with in between most likely waiting on git? note: this run did not give the error, but left the project 'dirty', some file was changed and was not yet saved.

trace: [Trace-merge worktree.json](<../../../Trace-merge worktree.json>)

trace of main: [CPU-integrate into project.cpuprofile](file:///C:/Users/janbo/Documents/dev/CPU-integrate%20into%20project.cpuprofile)

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

The error is not a lost write: the queued change still commits on the next timer flush. The barrier gives up too early. It shows more now because integration usually follows agent runs that still write card fields, and auto push lengthens the window.

Not affected: `CommitBatcher.flush()` single-pass semantics are intended and covered by `commit_batcher.test.ts` ("keeps newer content queued when typing continues during a commit", "rebases edits queued while a move is being committed").

## Trace findings and required changes

The 27-second trace samples an activity-file write around 12 seconds and a card save queued around 19.7 seconds. It gives no evidence of repeated activity saves. The large UI bursts contain about 185-196 `WorktreeSelector` renders each.

### Integration commits and saves

The worktree's own commit is separate from integration. Today `worktree_service.js` may commit dirty primary-worktree files as a checkpoint, then commits the squash merge. `finalizeIntegration` in `local_bridge_dispatch.js` writes the resulting commit hash to the card's activity history and immediately makes another project commit. After successful integration with branch deletion, renderer `integrateCardWorktree()` clears the card's worktree and branch through two queued card mutations. The trace's final dirty state comes from those post-integration mutations.

* Keep the worktree commit separate. Do not make a primary-worktree checkpoint commit as an implicit integration step; require the pre-integration save barrier to settle primary changes, and handle any later external dirtiness explicitly.
* Make only the squash integration commit during integration. After it succeeds, update the activity history with its hash and mark that file dirty for normal project persistence; do not commit it inside `finalizeIntegration`. Queue the card's branch and assignment cleanup through the same normal persistence path. No immediate commit or flush for these metadata updates.
* The desktop activity writer currently writes directly to disk and commits immediately. A deferred activity write must be registered with project persistence so its dirty state is visible and a later normal save commits it. Keep conflict continuation and retry idempotent: one history record for the integration commit, with no card cleanup until successful completion.
* Do not change the shared `appendAndCommitSystemActivity` helper blindly: sequence integration also calls it, and action activity has its own immediate-commit callers. Inspect those paths before changing shared persistence behavior.

### Worktree selector updates

The desktop service reads all linked worktree records (branch, path, validity, Git status) and sends state through the bridge. The renderer `WorktreeService` owns the shared records list. `handleState()` currently replaces that entire list when any record changes and emits a broad `changed` event. Every selector's `useWorktreeSelectorState()` snapshot includes the list reference, although the list is only used for its assignment menu. A single worktree status change therefore renders selectors for unrelated and unassigned cards.

* Keep one renderer-owned records list. Reconcile an incoming status update into its matching record, preserving the list and unchanged record references. Emit a scoped event carrying the changed record's identity and value; use a separate list-membership event for additions, removals, or reordering.
* Each selector subscribes to its own resolved worktree record and the small values it displays (preparing state and project dirty state). It must not hold or compare the full records list while its menu is closed. Read the shared list only for the open assignment menu.
* Update other whole-list consumers (`useWorktrees`, `card_body_popover`, assignment context) so status and membership changes still reach the UI without broadcasting a replacement array. Preserve branch-based assignment resolution when numeric worktree positions change.

### Verification

Add focused tests for a change to one record leaving unrelated selectors' snapshots and renders stable, while the affected selector and an open assignment menu update. Cover record addition/removal, assignment reordering, and primary status changes. Test that successful integration makes no checkpoint or immediate activity commit, leaves activity and card metadata pending for normal save, and records the integration hash once across conflict continuation or retry. Keep the existing concurrent-edit commit-batcher tests.