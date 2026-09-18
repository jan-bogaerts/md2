---
author: 
id: F_357
internalId: 23d124ec-a23c-442f-af4d-f678be48084c
title: Add card sequence dialog
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__23d124ec-a23c-442f-af4d-f678be48084c.json
policy:
after: b750c85a-ac60-4608-b6e4-beb186e6ca60
---
Add Run-menu sequence builder for engine from [F_356](F_356_add_scheduled_card_sequence_engine.md).

## Current state

Run tab exposes project-context actions but no sequence command. Board uses `@dnd-kit` for card moves; action popup has reusable action selector buttons. No service owns ordered sequence draft. Existing schedule form covers one action/context only.

## implementation details

* Add `Add sequence` button to Run tab and open wide MUI dialog. Dedicated `EventTarget` service owns ordered `cardInternalIds`, selected action, ready state, trigger draft, selection, validation, and submit status.
* Accept dropped active cards from board and provide accessible Add cards control for list view and keyboard users. Ignore duplicate internal IDs. Render cards in one sortable column; drag reorders only draft. Delete key removes selected card when focus is not in editable control, and explicit remove action provides keyboard/touch equivalent.
* Reuse action-selector button presentation at top, but list only actions applicable to every selected card. Revalidate when order or selection changes. Require one action and one configured ready state.
* Trigger radio group: `Now`, `Set date and time`, `When account usage resets`, `When another card enters state`. Reuse F_355 trigger fields and validation. `Now` shows Start; scheduled variants show Schedule. Card-state trigger card cannot be any sequence member.
* Submit canonical internal IDs and selected values. `Now` registers sequence with `now` trigger and starts it during registration; other triggers register pending sequence. Close only after success and refresh active schedules.
* Dialog keeps header/footer pinned, body scrollable, buttons bottom right, error reporting through `dialogService`, and no inline React event handlers. Add menu, draft service, DnD, keyboard, filtering, trigger, submit, and accessibility tests.

## acceptance criteria

* Run menu opens sequence dialog; user can add active cards, reorder them, select one, and remove it with Delete or visible control.
* Sequence action list contains only actions valid for every selected card.
* User must select at least one card, one action, ready state, and complete trigger before submit.
* `Now` starts sequence immediately; other triggers register it pending and show it in active schedules.
* Card-state trigger cannot target sequence member. Account trigger identifies exact agent limit window.
* Persisted card order contains internal IDs, so card rename before execution does not alter sequence.
* Failed registration keeps dialog draft and reports error; successful registration closes dialog and refreshes active schedules.
