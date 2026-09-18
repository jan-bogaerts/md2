---
author: 
id: F_356
internalId: ef4c20d4-957e-4eea-8452-33bc996608f3
title: Add scheduled card sequence engine
status: ready
owner: 
affects:
agents:
  - design/activity/card__ef4c20d4-957e-4eea-8452-33bc996608f3.json
policy:
after: b750c85a-ac60-4608-b6e4-beb186e6ca60
branch: f_356_add_scheduled_card_sequence_engine
worktree: 2
changedFiles:
  - app/src/data/action_schedule_types.node.test.ts
  - app/src/data/electron_action_bridge.ts
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/schedule/schedule_store.js
  - desktop/src/actions/schedule/scheduled_card_context.js
  - desktop/src/actions/schedule/scheduled_card_context.test.mjs
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.js
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
  - shared/action_schedules.d.mts
  - shared/action_schedules.mjs
---
Add persisted ordered-card sequence execution under scheduler contract from [F\_352](F_352_extend_schedule_contract_and_apis.md).

## Current state

Scheduler record starts one action with one saved context and waits for terminal result. Action definitions can run linked before/after actions in same context, but no model represents one shared action over ordered cards. Card state events reach live runs, not scheduler workflow state.

## implementation details

* Define sequence payload with one `actionId`, ordered unique `cardInternalIds`, one `readyState`, and persisted progress: current index, current run ID when active, action-completed flag, ready-state-met flag. Require at least one card.
* Resolve current card and build fresh action context by internal ID before each item starts. Current path, title, state, type, and worktree come from current project data; persisted path never identifies item.
* When schedule trigger fires, start first action unattended. For each item, observe both conditions independently: action terminal status `completed`, and card currently in or later entering configured ready state. Advance only after both true. If state arrives before completion, remember it; if completion arrives first, wait.
* Failed action marks sequence failed. Cancelled action marks cancelled unless deletion removes record. Missing card/action or invalid configured state fails with explicit cause. Never skip item silently.
* Persist progress before starting each action and after every condition change, so restart resumes waiting state without rerunning completed item. Reconcile running item through action-run recovery; if outcome cannot be proven, fail instead of duplicating run.
* One active run per sequence. Existing action-level before/on/after chain remains part of each item and must complete before item action condition is met.
* Add registration, ordering, dual-condition orders, failure, cancellation, deletion, restart, rename, missing target, and duplicate-event tests.

## acceptance criteria

* Sequence runs selected action once per card in stored order.
* Next item never starts before previous action chain completed successfully and previous card is in ready state.
* State-before-completion and completion-before-state both advance exactly once after second condition.
* Failure, cancellation, missing card/action, or removed ready state stops sequence with clear terminal cause.
* Restart resumes current progress without rerunning completed cards or duplicating active action.
* Card rename does not affect execution because each item resolves by `cardInternalId`.
* Deleting running sequence cancels current action and prevents all remaining items.
