---
author: 
id: B_115
internalId: 2433b65f-efed-4a22-af41-529cd35af655
title: incorrect timer continue
status: ready
owner: 
affects:
agents:
  - design/activity/card__2433b65f-efed-4a22-af41-529cd35af655.json#conversation=agent-48c25526-8ac6-4cc0-9649-5a68d27443fe
  - design/activity/card__2433b65f-efed-4a22-af41-529cd35af655.json#conversation=agent-a97570e8-1a53-414e-9ebe-3c6ef1e860c1
policy:
branch: b_115_incorrect_timer_continue
worktree: 2
---

it seems that the timer just never stops. when a timer has been paused cause of waiting for input or any other state not running and the timer is then started again cause of new input, it seems the timer just adds the time in between to the time. so it seems that somewhere we store when the time was stopped and then when it starts again, we take the difference between last stop and restart and add that time to the timer. this is so so so wrong.

this is how the timer needs to work:

* start agent: start time from 0
* agent is running: increment timer
* agent pauses (any other state then running): timer is stopped, ex at 10 seconds
* new input is given, so timer start again, from 10
* agent runs again for 10 seconds, so total time \= 20 seconds

## Current state

`ConversationTimer` owns timer state in React. It initializes elapsed time from `Date.now() - conversation.startedAt`, adds time only while popup status is `running`, and freezes its local value for every other status. Resume works only while same component remains mounted.

When component mounts again, changes conversation, or receives `completedAt`, it calculates duration from conversation start and current or completion time. That calculation includes every waiting period because conversation stores start and completion timestamps but not accumulated running time. `completedAt` means when conversation finally completed and must keep that meaning.

Here, **elapsed running time** means sum of periods during which conversation status is `running`. Time in `queued`, `waitingForInput`, `completed`, `failed`, `cancelled`, or `idle` is excluded.

## Implementation details

* Add one persisted `timer` field to `AgentConversation`: `{ elapsedMs: number, runningStartedAt: string | null }`.
* `elapsedMs` stores completed running periods. `runningStartedAt` stores start of current running period and is `null` whenever conversation is not running.
* Create new conversation with `elapsedMs: 0` and `runningStartedAt` equal to conversation start time.
* On transition from `running` to any non-running status, add `transition time - runningStartedAt` to `elapsedMs`, then set `runningStartedAt` to `null`.
* On transition from non-running status to `running`, keep `elapsedMs` and set `runningStartedAt` to transition time. Repeated events that do not change running/non-running state must not add time or reset timestamp.
* Apply timer transition in desktop agent state flow before publishing and persisting conversation snapshots. Cover questions, approvals, turn completion, user messages, answers, failures, cancellation, and final completion.
* Keep `startedAt` as conversation creation time and `completedAt` as final completion time. Neither field measures elapsed running time.
* Persist and parse `timer` with conversation. Validate `elapsedMs` as finite non-negative number and `runningStartedAt` as valid timestamp or `null`. Existing records without `timer` have unavailable duration; do not reconstruct running time from `startedAt` and `completedAt`.
* Make `ConversationTimer` presentation-only. While running, display `timer.elapsedMs + Date.now() - timer.runningStartedAt` and update once per second. While non-running, display `timer.elapsedMs` without scheduling interval.
* Keep current duration formatting, timer placement, conversation selection, status labels, and context-usage display unchanged.
* Update focused desktop state-transition and persistence tests, shared conversation-parser tests, action-run registry tests, and `ConversationTimer` tests.

## Acceptance criteria

* New conversation starts at `0:00`; timer advances only while status is `running`.
* After 10 seconds running, any non-running status freezes timer at 10 seconds. Ten seconds waiting does not change displayed or persisted elapsed time.
* Resuming sets new running-period start without changing accumulated 10 seconds. Another 10 seconds running displays and persists 20 seconds total.
* Multiple pause/resume cycles add each running period exactly once. Duplicate status events do not add time or reset current running-period start.
* Completion, failure, or cancellation closes current running period once and freezes final elapsed running time. `completedAt` remains actual completion timestamp.
* Popup close/reopen, conversation switching, component remount, and app restart preserve same elapsed running time.
* Questions, approvals, queued input, and other non-running states never contribute to elapsed running time.
* Existing conversation without `timer` does not show a fabricated duration and still loads without error.
* Timer continues using existing `m:ss` and `h:mm:ss` formatting and updates no more than once per second.
