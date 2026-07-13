---
id: J-007
title: split desktop action scheduler into store, timers and service
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Item 4 of J-002. `desktop/action_scheduler_service.js` is ~691 lines mixing schedule persistence, timer bookkeeping and run orchestration. Split into a pure store module, a timers module and a composing service. Pure refactor — **no behavior change**.

Depends on: J-003 (the unused `schedule_store.js`/`schedule_timers.js` duplicates deleted, core renamed back) — this task recreates those two filenames by **moving** the inline logic out of the service.

## implementation details
- `desktop/schedule_store.js` — ID-based schedule file read/write/validation and schedule-status transitions, written as pure functions over the JSON model.
- `desktop/schedule_timers.js` — timer registration/cancellation per trigger type (`at`, `agentSlot`, `afterAction`), reconciliation against a store snapshot.
- `ActionSchedulerService` keeps project lifecycle and timer/event coordination. When a timer fires, it delegates `{ actionId, context, runInput }` to the Electron action runner; it contains no action-chain execution.
- Two commits (store, then timers); after each, the service must call the extracted module — no inline copies of the moved functions may remain (the first attempt created the modules but the service kept its own copies).
- Run the desktop test suite after each commit; add/move unit tests for the pure store functions.

## acceptance criteria
- `action_scheduler_service.js` is under ~300 lines and contains no schedule-file IO or timer-registration internals — it delegates to the two modules.
- `schedule_store.js` functions are pure and unit-tested without a service instance.
- Scheduler registration uses action ids, and every fired schedule delegates to the Electron action runner. Desktop tests and lint pass.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
