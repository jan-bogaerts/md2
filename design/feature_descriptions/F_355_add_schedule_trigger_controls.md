---
author: 
id: F_355
internalId: b750c85a-ac60-4608-b6e4-beb186e6ca60
title: Add schedule trigger controls
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__b750c85a-ac60-4608-b6e4-beb186e6ca60.json
policy:
after: 57ceeeca-6732-42a3-b77f-b1c459a2f268
---
Extend action-popup scheduling UI for event triggers delivered by [F_353](F_353_run_schedules_from_account_and_card_events.md).

## Current state

`ActionScheduleStore` owns only open, timestamp, and message fields through custom listener set. `ActionScheduleForm` displays datetime input and button. `ActionScheduleOwner` creates `at` trigger and registers current action/context. Account runtime data and project cards are available elsewhere but not in schedule form.

## implementation details

* Replace listener set with `EventTarget`; keep form state service-owned. Snapshot includes selected trigger type and only fields needed by that trigger.
* Render radio group: `Set date and time`, `When account usage resets`, `When another card enters state`. Date selection keeps future validation.
* Account selection requires agent, then exact available limit/window. Display reset time and usage so similarly named trackers are distinguishable. Registration captures current tracker `resetsAt` as expected occurrence; unavailable or reset-less tracker cannot submit.
* Card-state selection requires another active card and configured target state. Store `Card.header.internalId`; render current title/path only as label. Exclude action context card and cards without internal ID.
* Keep registration result inline. Real errors go through `dialogService` from effect-safe owner flow; form renders safe fallback and never throws during render.
* Reuse loaded actions/cards/config/runtime services; do not create duplicate canonical schedule state. Add store, trigger builder, form, registration, unavailable-data, and identity tests.

## acceptance criteria

* User schedules current action through exactly one of three trigger types.
* Account trigger cannot register until agent and exact tracker window with reset time are selected.
* Card trigger cannot select current action card and persists selected other card's internal ID plus state.
* Switching trigger type neither submits hidden stale fields nor loses valid values when switching back.
* Successful registration refreshes active schedules; backend error is reported without crashing popup.
* Existing date/time scheduling behavior remains valid.
