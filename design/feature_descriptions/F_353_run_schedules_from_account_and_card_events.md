---
author: 
id: F_353
internalId: 03616c27-a15f-43f5-8ba8-523c9e9a56d1
title: Run schedules from account and card events
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__03616c27-a15f-43f5-8ba8-523c9e9a56d1.json
policy:
---
Execute new event triggers defined by [F_352](F_352_extend_schedule_contract_and_apis.md).

## Current state

Scheduler reconciles only bounded date timers. Renderer sends card state changes to `ActionRunnerService`, which forwards them to live runs. `CodexRuntimeService` and `ClaudeRuntimeService` publish validated account snapshots through `EventTarget`; scheduler is not consumer. Project activation starts runner and scheduler before requesting account refresh.

## implementation details

* Route card-state notifications through scheduler and action runner. Scheduler matches pending triggers by `cardInternalId` and target state. Registration-time state prevents immediate firing when card already has target state; first later transition into target fires once.
* Subscribe scheduler to both runtime services. Match account snapshots by agent, `limitId`, and `windowId`. Fire when selected tracker's reset occurrence reaches or passes persisted expected reset timestamp. Changed future `resetsAt` proves previous window reset; startup snapshot after expected time also releases schedule missed while app was closed.
* During `startProject`, reconcile persisted event triggers after services are ready. Unsubscribe and clear project-specific observations on project switch or stop. Ignore stale provider observations older than schedule creation.
* Reuse one idempotent `fireSchedule` gate for time and event triggers. Concurrent timer, usage, card, watcher, or restart reconciliation may start schedule at most once.
* If selected agent, limit, or window no longer exists, keep schedule pending and expose unavailable detail for F_354; do not silently choose another tracker.
* Add focused scheduler, bridge, runtime-subscription, restart, stale-event, and duplicate-event tests.

## acceptance criteria

* Another card entering configured state after registration starts pending action once.
* Same-state notifications and state changes for other cards do not start it.
* Selected agent tracker reset starts pending action once; other agents, limits, or windows do not.
* Schedule missed while app was closed fires once after startup data proves selected reset occurred.
* Removed tracker leaves schedule pending with unavailable reason.
* Project switch cannot let old project's state or usage event start new project's schedule.
* Duplicate and concurrent matching events never create duplicate runs.
