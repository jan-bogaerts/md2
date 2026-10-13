---
author: 
id: B_303
internalId: 54a27abd-2174-4b6a-b688-ed2352c50856
title: sequence does not see the correct ready state
status: ready
owner: 
affects:
agents:
  - design/activity/card__54a27abd-2174-4b6a-b688-ed2352c50856.json
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
branch: b_303_sequence_does_not_see_the_correct_ready_state
worktree: 3
changedFiles:
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.js
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.test.mjs
  - desktop/src/actions/schedule/sequence_worktree_execution.test.mjs
---

Most likely the sequence scheduler is monitoring the file in the worktree and not the one in the main repository. this is where the change will occur.

## Findings

The hypothesis is confirmed. A sequence that runs in a worktree only reads the ready state from its worktree checkout, so a state change made in the main repository is never noticed.

1. Main repository card changes reach `ActionSchedulerService.handleCardStateChange` through `local_bridge_dispatch.js`. That method calls `ScheduledCardSequenceEngine.handleCardStateChange` without a checkout path, so the path is `null`. `handleCardStateChangeNow` only accepts schedules whose `branchProgress.checkoutPath` equals the event path. A worktree sequence always has a real worktree path, so the event is filtered out. `markReadyStateMet` repeats the same check.
2. `SequenceWorktreeExecution.watch` runs a separate `CardStateTracker` on the sequence worktree. Its events carry the worktree path, so they are the only state changes a worktree sequence currently accepts.
3. `refreshReadyState` runs on activation, recovery and advance. It uses `ActionSchedulerService.resolveSequenceCardContext`, which loads the card from the worktree checkout and not from the main repository. A ready state set in the main repository is therefore also missed after a restart.
4. Sequences without a worktree are not affected. They have no `branchProgress`, so both sides are `null` and main repository events match.

## Proposed solution

Both the main repository and the sequence worktree are valid sources of the ready state.

1. In `ScheduledCardSequenceEngine.handleCardStateChangeNow` and `markReadyStateMet`, accept an event when its checkout path is `null` (main repository) or equals the sequence's `branchProgress.checkoutPath` (sequence worktree). Events from other worktrees remain ignored.
2. Keep `SequenceWorktreeExecution.watch` forwarding worktree transitions to the engine, unchanged.
3. Give the engine a main repository card lookup through `ActionSchedulerService.resolveCardContext`. `refreshReadyState` marks the ready state as met when either the main repository card or the worktree card is in the ready state. `startCurrentAction` keeps using `resolveSequenceCardContext`, because the action still runs in the worktree.
4. `ActionRunnerService.handleCardStateChange` keeps its current checkout path matching, so `autoFinish` behavior does not change.

## Testing

Add regression tests to `scheduled_card_sequence_engine.test.mjs`:

* a ready state set in the main repository advances a worktree sequence;
* a ready state set in the sequence worktree still advances it;
* a ready state set in another worktree does not advance it;
* `refreshReadyState` detects a ready state that exists only in the main repository.
