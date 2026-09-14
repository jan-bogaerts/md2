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
after: 67d4a581-6ded-4a41-a489-d079644e3e5b
---
Execute new event triggers defined by [F\_352](F_352_extend_schedule_contract_and_apis.md).

## Current state

Scheduler reconciles only bounded date timers. Renderer sends card state changes to `ActionRunnerService`, which forwards them to live runs. Codex and Claude account snapshots expose reset times to renderer, but scheduler cannot register those times as named account-reset triggers.

## implementation details

* Route card-state notifications through scheduler and action runner. Scheduler matches pending triggers by `cardInternalId` and target state. Registration-time state prevents immediate firing when card already has target state; first later transition into target fires once.
* Treat account reset as provider-reported reset time captured during registration. Arm same bounded timer strategy as `at`, while retaining agent, `limitId`, and `windowId` for display. Fire at persisted expected reset timestamp; after restart, overdue pending trigger fires during reconciliation. Later provider estimates do not silently retarget registered schedule.
* During `startProject`, reconcile persisted time and card-state triggers after services are ready. Clear project-specific observations on project switch or stop.
* Reuse one idempotent `fireSchedule` gate for time and event triggers. Concurrent timer, usage, card, watcher, or restart reconciliation may start schedule at most once.
* Add focused scheduler, bridge, timer, restart, stale-card-event, and duplicate-event tests.

## acceptance criteria

* Another card entering configured state after registration starts pending action once.
* Same-state notifications and state changes for other cards do not start it.
* Selected agent tracker reset starts pending action once; other agents, limits, or windows do not.
* Schedule missed while app was closed fires once during startup reconciliation.
* Later usage snapshots cannot retarget already registered reset time.
* Project switch cannot let old project's state or usage event start new project's schedule.
* Duplicate and concurrent matching events never create duplicate runs.