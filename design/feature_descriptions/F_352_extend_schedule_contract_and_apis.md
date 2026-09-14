---
author: 
id: F_352
internalId: e77dd870-74a2-4509-97c0-ce42ffc064fd
title: Extend schedule contract and APIs
status: ready
owner: 
affects:
agents:
  - design/activity/card__e77dd870-74a2-4509-97c0-ce42ffc064fd.json
policy:
changedFiles:
  - app/src/data/action_schedule_types.node.test.ts
  - app/src/data/action_schedule_types.ts
  - app/src/data/data_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/data/electron_data_bridge.ts
  - app/src/services/data/local_git_storage_service.ts
  - app/src/services/data/remote_control_storage_service.ts
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/schedule/schedule_store.js
  - desktop/src/actions/schedule/schedule_store.test.mjs
  - desktop/src/actions/schedule/schedule_timers.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
  - shared/action_schedules.d.mts
  - shared/action_schedules.mjs
---
Foundation for [F\_331](F_331_improve_schedule_action.md): define persisted schedule variants and management APIs used by later UI and execution jobs.

## Current state

`app/src/data/action_schedule_types.ts` and `desktop/src/actions/schedule/schedule_store.js` duplicate validation for one action schedule with one `at` trigger. `ActionSchedulerService.registerActionSchedule` appends records; cancellation changes pending status to `cancelled`. Data bridge can load schedules and cancel one, while action bridge can register one. No API returns only active schedules or permanently deletes a record.

## implementation details

* Extend shared schedule shape with required `kind: 'action' | 'sequence'` and triggers `now`, `at`, `account-reset`, and `card-state`. `now` is valid only for a sequence and fires during registration. Action records retain `actionId` and `context`. Sequence payload is reserved for F\_356.
* `account-reset` stores agent name, `limitId`, `windowId`, and expected reset timestamp. Tracker means one provider-reported account limit window, identified by those three fields. `card-state` stores `cardInternalId`, registration-time state, and target state; scheduled action target and trigger card must differ.
* Move duplicated parser/serializer into one shared `.mjs` contract with `.d.mts` declarations. Both renderer and desktop import it. Reject unknown kinds, triggers, statuses, missing identities, invalid timestamps, and duplicate sequence card identities.
* Add scheduler-owned `listActiveSchedules` and `deleteSchedule`. List returns only `pending` and `running`. Delete validates ID, cancels in-flight run when present, removes record instead of retaining `cancelled`, and reconciles timers.
* Expose list/delete through preload and `ElectronActionBridge`. Keep existing registration callable while F\_355 migrates UI. Do not change terminal result handling.
* Test parsing each variant, invalid records, active filtering, pending deletion, running deletion, and unknown ID failure. Require new discriminator directly; do not add legacy-shape fallback.

## acceptance criteria

* Renderer and desktop use one schedule parser and produce same validated shape.
* Date/time action schedules still register and execute through required action schedule shape.
* Account tracker identity contains agent, limit, and window; card trigger identity uses `cardInternalId`, never path.
* Active listing excludes `completed`, `failed`, and `cancelled` records.
* Deleting pending schedule removes record and timer. Deleting running schedule cancels run, waits for cancellation handling, removes record, and leaves no timer or run mapping.
* Missing or malformed required schedule data fails with clear error.
