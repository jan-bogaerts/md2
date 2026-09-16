---
author: 
id: B_239
internalId: d268cc88-c21e-4d97-a7bb-1491da4852b3
title: always write terminal activity record
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__d268cc88-c21e-4d97-a7bb-1491da4852b3.json
policy:
---
Guarantee that every finished action leaves a terminal record on disk. This is the directly reported symptom of [B\_235](B_235_end_of_action_not_logged.md).

## Current state

Three paths end an action without writing its end.

`persistRootActivity` (`desktop/src/actions/action/action_run.js:479`) returns `false` without writing any record when the root action is an agent and `rootConversationId` is not a string. That happens when the agent phase threw before a conversation id existed. The action ends silently: no activity record, no error surfaced.

In `AgentRunnerService.handleClose` (`agent_runner_service.js:731-752`), `continuedTurnFailedBeforeStart` — a continued turn that failed before the turn started — skips `persistConversation` entirely. The in-memory conversation has already been transitioned to its terminal status, and the `closed` event carries that corrected conversation to the renderer, but the file on disk keeps the previous checkpoint, which says `running`.

When `persistConversation` does run and throws, the error is routed to `onCompletionError` and the `closed` event is still emitted. Again the renderer looks right for the rest of the session while the file says `running`. This is why the wrong state survives a restart.

## implementation details

* `persistRootActivity` always writes a record. With no conversation id, write a failure record carrying the cause of the agent-phase failure instead of returning early. The early return is removed, not widened.
* `handleClose` persists the terminal conversation for `continuedTurnFailedBeforeStart` as well. The turn never starting is a reason for a `failed` record, not a reason to skip writing.
* A failing terminal persist is retried a bounded number of times; a still-failing write is surfaced to the user and logged with the run id and conversation id. The run never completes silently with `running` on disk.
* Emit the `closed` event only after the terminal state is durable, or mark the event as unpersisted so consumers know the file disagrees. Renderer and file must not diverge without anyone knowing.
* Log the terminal write alongside the existing `[agent:complete]` entry so a missing record is traceable after the fact.
* Tests: agent phase throwing before a conversation exists writes a failure record; continued turn failing before start writes a terminal record; persist failure retries and then reports; no path reaches process exit with an in-memory terminal status and `running` on disk.

## acceptance criteria

* Every action run leaves an activity record with a terminal status, including runs that fail before an agent conversation exists.
* A continued turn that fails before starting is persisted as failed.
* A terminal write that cannot succeed is reported to the user and logged; it is never swallowed.
* After any run ends, restarting the app never shows that run as still running.