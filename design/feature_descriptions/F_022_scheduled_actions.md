---
id: F-022
title: scheduled actions (timers)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 181cae82-0bf5-447b-8646-1ef33c111db1
---

## Goal

Schedule actions by stable action `id` at a date and time selected by the user. The scheduler runs in Electron and delegates execution to the same Electron action runner as manual and state-triggered runs.

## Current state

The action popup registers date/time schedules by action id. Electron persists them, restores pending timers when a project opens, and executes due schedules through the shared Electron action runner.

## implementation details

- Define a typed schedule model with schedule id, action id, context, trigger, created timestamp, and schedule status.
- Support one trigger: `at` with an absolute timestamp created from the user's local date/time selection.
- Use schedule states `pending`, `running`, `completed`, `failed`, and `cancelled`. These are separate from the execution states emitted by the action runner.
- Persist schedules as JSON in the repository so they survive restarts and project synchronization.
- Add `Schedule` before `Run` in the action popup. It opens a required date/time input and sends `{ actionId, context, trigger: { type: 'at', timestamp } }` to Electron.
- Electron owns schedule persistence and timer reconciliation so registration has one bookkeeping path.
- When a project loads, restore pending schedules and timers. When the schedule file changes, reconcile timers.
- When a schedule fires, call the Electron action runner by action id. Store the execution result and update the schedule to its terminal schedule state.
- Reject missing, invalid, and non-future timestamps during registration.
- Re-register delays beyond the platform timer limit instead of firing early.
- Surface scheduled runs through the global running-actions indicator and normal action history.
- Cancelling a pending schedule removes its timer and updates the JSON. Cancelling an already running scheduled action delegates to the Electron action runner's execution cancellation.

## acceptance criteria

- The popup shows `Schedule` before `Run` for every runnable action.
- Schedules persist action ids, not names, and survive action renaming and app restart.
- Date/time schedules fire through the single Electron action runner.
- Schedule status and action execution status remain separate.
- Pending cancellation removes the timer; running cancellation stops the Electron execution.
- Missing action ids, invalid timestamps, and invalid schedule files report visible errors without dropping other schedules.
- Tests cover date/time registration, persistence, id-based restore, timer reconciliation, long delays, runner delegation, terminal states, and both cancellation paths.

## see also

- `design\architecture\initial description\timers.md`
- `design\architecture\initial description\writings\running_actions.md`
- `design\feature_descriptions\ready\F_010c_command_execution_and_chaining.md`
