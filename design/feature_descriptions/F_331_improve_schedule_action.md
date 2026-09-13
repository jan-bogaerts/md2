---
author: 
id: F_331
internalId: 67d4a581-6ded-4a41-a489-d079644e3e5b
title: Improve schedule action
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__67d4a581-6ded-4a41-a489-d079644e3e5b.json
policy:
---
Improve scheduled actions with account-reset and card-state triggers, active-schedule management, and ordered card sequences. This umbrella splits implementation into focused jobs.

## Current state

Action popup schedules one action for one context at future date and time. `ActionScheduleTrigger` supports only `at`; `.md2-schedules.json` stores pending and terminal schedules; `ActionSchedulerService` reconciles timers, starts unattended actions, and marks results. Cancellation exists through storage and bridge APIs, but Run menu has no schedule controls or active-schedule dialog.

Card state changes already cross renderer-to-desktop boundary through `notifyActionCardStateChange`, but only active action runs consume them. Claude and Codex runtime services publish account-usage snapshots containing tracker identities and reset times, but scheduler does not subscribe. Existing action chains link actions for one context; they do not run one action across ordered cards.

## implementation details

Implement jobs in dependency order:

1. [F_352 extend schedule contract and APIs](F_352_extend_schedule_contract_and_apis.md)
2. [F_353 run schedules from account and card events](F_353_run_schedules_from_account_and_card_events.md)
3. [F_354 add active schedules dialog](F_354_add_active_schedules_dialog.md)
4. [F_355 add schedule trigger controls](F_355_add_schedule_trigger_controls.md)
5. [F_356 add scheduled card sequence engine](F_356_add_scheduled_card_sequence_engine.md)
6. [F_357 add card sequence dialog](F_357_add_card_sequence_dialog.md)

`Card.header.internalId` remains card identity. Paths may be stored only as persistence or navigation locations and must be resolved from current card data before use. "Active schedule" means status `pending` or `running`. Deleting one cancels any running action, removes persisted record, then reconciles scheduler state.

Sequence uses one selected action and one configured ready state for every ordered card. Next card starts only after previous action completes successfully and that card is in ready state. Either condition may happen first; engine waits for other. Failed or cancelled action stops sequence.

## acceptance criteria

* All six child cards meet their acceptance criteria.
* Single actions support date/time, selected agent tracker reset, and another card entering selected state.
* Run menu can inspect, open, and delete every active single-action or sequence schedule.
* User can create, reorder, start, and schedule one action across ordered cards.
* Sequence never starts next card until previous action completed successfully and previous card reached configured ready state.
* Schedules survive restart without using card paths as identity.
