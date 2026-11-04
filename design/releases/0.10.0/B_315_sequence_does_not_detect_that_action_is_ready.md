---
author: 
id: B_315
internalId: 8a987dbe-da9b-4029-bfc6-0de9dee46a41
title: sequence does not detect that action is ready
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__8a987dbe-da9b-4029-bfc6-0de9dee46a41.json
policy:
changedFiles:
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.js
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.test.mjs
after: c198a211-ff9a-41ec-b20d-5d300cac7035
---

The first card in a sequence is ready. The 'ready' state was correctly detected. the action is also done, but the sequence runner did not detect that the action was ready. this is a problem. Now the sequence is stuck. what caused this?

## Findings

Observed case: sequence `schedule-1792228742618-dxd32kni` in the vidsy project (action `implement`, first card J_23, 2026-10-17).

* The persisted state has `readyStateMet: true` and `actionCompleted: false`. The final failure is `Cannot recover sequence action waiting on its conversation: conversation agent-78b1a3d4-… is completed`.
* The card activity shows one uninterrupted agent run (`action-a0dabd6a-…`, a single agent turn id). The agent set J_23 to `ready`, autoFinish fired, the conversation completed at 09:29:23 and the run record completed at 09:29:24. The action therefore finished normally; the sequence never received its result.
* That persisted state (`conversationId` set, `currentRunId` null) is only produced by `awaitConversationOrFail` in `desktop/src/actions/schedule/scheduled_card_sequence_engine.js`, reached through `failUnrecoverableRun`.

Cause:

1. `observeRunNow` wraps both `actionRunnerService.wait(runId)` and `applyRunResult` in one `try`. Any error from either call goes to `failUnrecoverableRun`.
2. `failUnrecoverableRun` assumes the run died with a previous process. Because the conversation was still `running`/`waitingForInput`, `awaitConversationOrFail` cleared `currentRunId` and the sequence switched to waiting for the conversation.
3. A waiting sequence only advances when a new run starts on that conversation (`agentStarted` → `adoptRun` in `action_scheduler_service.js`) or when the user closes the conversation (`handleConversationClosed`). The original run kept going and completed on its own, so neither happened and the sequence was stuck until the restart failed it.
4. The error that started this was swallowed: the waiting path of `failUnrecoverableRun` does not call `reportError`.

The exact throwing call is not proven, because no desktop logs exist. The most plausible trigger is a race where a second engine instance (created when project services restart) observes the persisted `currentRunId` before the run is registered, so `wait` throws `Unknown action run`.

## Proposed solution

1. `failUnrecoverableRun` only gives up on a run when `actionRunnerService` no longer knows it; while the run is live, the engine keeps observing it.
2. An error from `applyRunResult` fails the sequence with that error instead of switching it to conversation waiting.
3. When a run finishes on conversation X and a running sequence waits on X without a `currentRunId`, the scheduler applies that run's result to the sequence (mirrors the existing `agentStarted` adoption).
4. `failUnrecoverableRun` reports its error through `reportError` in every path.

Tests: regression tests in `desktop/src/actions/schedule/scheduled_card_sequence_engine.test.mjs` for a `wait` failure while the run is still live, for an `applyRunResult` failure, and for completion of an unadopted run on the waiting conversation.