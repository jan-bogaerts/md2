---
author: 
id: B_300
internalId: dc18bd32-58a2-4426-99ce-c79309619b03
title: Error: Sequence schedule-1791896021654-jvp09iga fa
status: design
owner: 
affects:
agents:
  - design/activity/card__dc18bd32-58a2-4426-99ce-c79309619b03.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153363943
sentryOrganization: elastetic
---
## Sentry issue

**Title:** Error: Sequence schedule-1791896021654-jvp09iga failed: Cannot recover sequence action run action-25481df9-0ea9-4533-b1bd-5d3a39642958: Unknown action run: action-25481df9-0ea9-4533-b1bd-5d3a39642958

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153363943/)

**First seen:** 2026-10-13T13:07:32Z

**Last seen:** 2026-10-13T13:07:32Z

**Occurrences:** 1

**Release:** desktop@0.8.3

**Environment:** production

**Culprit:** ScheduledCardSequenceEngine.failSequence(desktop.src.actions.schedule:scheduled\_card\_sequence\_engine)

**Event ID:** 2e23301de3b740d88485252f87341568

### Application stack frames

* `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:206:9` — ScheduledCardSequenceEngine.failUnrecoverableRun
* `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:255:30` — ScheduledCardSequenceEngine.failSequence

The first card was started, but was waiting for input. Then we closed the app and opened it again.

The sequence algorithm should be able to pick up that the sequence was still running and waiting for a user interaction to finish.

## Findings

* Action runs exist only in memory. `ActionRunnerService` keeps them in `runs` and `completedRunResults` (`desktop/src/actions/action/action_runner_service.js`, `wait`). A sequence persists only the `currentRunId` of its current step.
* On startup, `ActionSchedulerService` calls `sequenceEngine.activate()` for every sequence with status `running`. `activateLocked` finds a `currentRunId` and calls `observeRun`. `actionRunnerService.wait(runId)` throws `Unknown action run` because the run died with the previous process. `observeRunNow` catches the error and `failUnrecoverableRun` marks the sequence failed. This is the reported error.
* The existing test in `scheduled_card_sequence_engine.test.mjs` ("Unknown action run: lost-run") expects this failure, so the behaviour is deliberate, not accidental.
* The agent conversation survives the restart. It is stored in the card activity file with status `waitingForInput`. The user can continue it, which starts a new action run with `continueFrom`/`conversationId`, or close it as completed or cancelled through `closeWaitingActivityConversation` (`desktop/src/actions/activity/activity_files.js`).
* The sequence has no link to that conversation, so it cannot tell that its step is still alive and waiting for the user.
* A conversation that was mid-turn (`running`) when the app closed has no live process either; it can only resume when the user continues it.
* Plain action schedules have the same limitation: `reconcileInterruptedActionSchedules` marks them failed on startup.

## Solution

1. When a sequence starts a step, persist the conversation id (`AgentConversation.id`) next to `currentRunId`. The run id remains the live handle; the conversation id is the identity that survives a restart.
2. On activation, when `wait` reports an unknown run and the persisted conversation is still `waitingForInput` or `running`, do not fail the sequence. Clear `currentRunId` and keep the sequence running, waiting on the conversation. Keep the worktree claim held, because `branchProgress.phase` is still `running`.
3. When an action run starts with `runInput.conversationId` equal to the persisted id, the engine adopts that run: it sets `currentRunId` to the new run and calls `observeRun`. The existing `applyRunResult` path then finishes the step.
4. When the user closes the waiting conversation, the step ends: `completed` sets `actionCompleted`, and `cancelled` cancels the sequence.
5. When the persisted conversation is already terminal or missing at startup, the sequence still fails, with a message that names the conversation.

### Plain action schedules

Plain action schedules get the same recovery.

* Today `executeSchedule` in `action_scheduler_service.js` keeps the run id only in the in-memory `runIdsByScheduleId` map and persists only the `running` status. On startup, `reconcileInterruptedActionSchedules` marks every `running` action schedule failed.
* When a plain action schedule starts its run, persist the conversation id on the schedule record.
* Replace the blanket failure in `reconcileInterruptedActionSchedules`: when the persisted conversation is still `waitingForInput` or `running`, keep the schedule `running` and waiting on the conversation. Otherwise, mark it failed as today.
* Adopting a continued run and closing the waiting conversation work as for sequences. The adopted run's result sets the schedule status through `scheduleStatusFromResult`. Closing the conversation as `completed` or `cancelled` sets the matching schedule status.
* Sequences and plain action schedules both need the lookup "which running schedule waits on this conversation". Implement it once, in a shared module function, and call it from both paths.

## Testing

* Update the "lost run" test in `scheduled_card_sequence_engine.test.mjs` to expect the sequence to keep running while its conversation is waiting.
* Add tests for adopting a continued run, closing a waiting conversation as completed or cancelled, and failing when the conversation is terminal or missing.
* Add the same cases for plain action schedules in the `action_scheduler_service` tests, including startup reconciliation that keeps a waiting schedule running and still fails one whose conversation is terminal or missing.