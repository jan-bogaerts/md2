---
author: 
id: F_400
internalId: ee69c5dd-bb25-4e62-8837-e250eae7cc88
title: improve scheduled tasks for cards
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__ee69c5dd-bb25-4e62-8837-e250eae7cc88.json
policy:
branch: f_400_improve_scheduled_tasks_for_cards
worktree: 2
---

* if a card has an action scheduled to be run, show a 'timer' icon on the card
* when the user schedules an action from the schedule popup on the action-popup, it says at the bottom 'task scheduled' (or similar). This is ok but the popup should close and the 'schedule icon' in the action-popup's input box, should show in orange ('warning' I think), like used for the 'run' button and action-buttons.
* the action button on the action-popup should also use the 'alert' color and show a small timer icon to indicate it is scheduled.

## Current state

* Registering an action schedule refreshes `activeScheduleService`, but `ActionScheduleOwner` leaves the schedule popover open and displays "Schedule registered".
* `ActiveScheduleService` loads pending and running schedules from the Electron scheduler. Board cards, the popup's Schedule control, and action selector buttons do not read this schedule state. They show only run and agent state.

## implementation details

* Derive scheduled indicators from pending action schedules in `activeScheduleService`. Match the action by `actionId` and its target card by `context.cardInternalId`; use `Card.header.internalId` for card identity. A card used only as a `card-state` trigger is not the scheduled action's target. Multiple matching schedules still produce one indicator.
* Add a focused service selector and scoped subscription for the target card and card plus action. `CardRunButton` shows a timer icon when that card has a scheduled action. `ActionPopupBottomRow` colors the Schedule icon `warning.main` when its selected action is scheduled. `ActionSelectorButton` shows a small timer icon and uses `warning.main` for a scheduled action. Preserve existing running and waiting state indicators when those states apply.
* After successful registration and schedule refresh, close only the schedule popover. Keep it open on failure and report the error through `dialogService`. Indicators update when a schedule is registered, deleted, executed, or the project changes; they do not depend on the popover being open.

## acceptance criteria

* Scheduling an action for a card closes the schedule popover after success. The card shows a timer; its action selector button shows a small timer and warning color; the Schedule icon shows warning color while that action is selected.
* A different action on the same card, a different card, and a card used only as a trigger show no scheduled indicator. Switching selected actions updates the Schedule icon.
* Deleting or completing the last pending matching schedule clears its indicators. If another pending matching schedule remains, indicators remain. Project changes clear indicators from the previous project.
* Registration failure leaves the schedule popover open and shows an error. Existing running and waiting indicators remain visible.
