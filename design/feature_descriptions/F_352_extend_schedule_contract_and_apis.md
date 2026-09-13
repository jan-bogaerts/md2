---
author: 
id: F_352
internalId: e77dd870-74a2-4509-97c0-ce42ffc064fd
title: Extend schedule contract and APIs
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__e77dd870-74a2-4509-97c0-ce42ffc064fd.json
policy:
---
Foundation for [F_331](F_331_improve_schedule_action.md): define persisted schedule variants and management APIs used by later UI and execution jobs.

## Current state

`app/src/data/action_schedule_types.ts` and `desktop/src/actions/schedule/schedule_store.js` duplicate validation for one action schedule with one `at` trigger. `ActionSchedulerService.registerActionSchedule` appends records; cancellation changes pending status to `cancelled`. Data bridge can load schedules and cancel one, while action bridge can register one. No API returns only active schedules or permanently deletes a record.

## implementation details

* Extend shared schedule shape with `kind: 'action' | 'sequence'` and triggers `at`, `account-reset`, and `card-state`. Action records retain `actionId` and `context`. Sequence payload is reserved for F_356.
* `account-reset` stores agent name, `limitId`, `windowId`, and expected reset timestamp. Tracker means one provider-reported account limit window, identified by those three fields. `card-state` stores `cardInternalId`, registration-time state, and target state; scheduled action target and trigger card must differ.
* Move duplicated parser/serializer into one shared `.mjs` contract with `.d.mts` declarations. Both renderer and desktop import it. Reject unknown kinds, triggers, statuses, missing identities, invalid timestamps, and duplicate sequence card identities.
* Add scheduler-owned `listActiveSchedules` and `deleteSchedule`. List returns only `pending` and `running`. Delete validates ID, cancels in-flight run when present, removes record instead of retaining `cancelled`, and reconciles timers.
* Expose list/delete through preload and `ElectronActionBridge`. Keep existing registration callable while F_355 migrates UI. Do not change terminal result handling.
* Test parsing each variant, old `at` records, invalid records, active filtering, pending deletion, running deletion, and unknown ID failure.

## acceptance criteria

* Renderer and desktop use one schedule parser and produce same validated shape.
* Existing persisted `at` action schedules still load and execute.
* Account tracker identity contains agent, limit, and window; card trigger identity uses `cardInternalId`, never path.
* Active listing excludes `completed`, `failed`, and `cancelled` records.
* Deleting pending schedule removes record and timer. Deleting running schedule cancels run, waits for cancellation handling, removes record, and leaves no timer or run mapping.
* Missing or malformed required schedule data fails with clear error.
