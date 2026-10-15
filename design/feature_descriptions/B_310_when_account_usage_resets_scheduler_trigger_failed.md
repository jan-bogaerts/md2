---
author: 
id: B_310
internalId: bc79eb8f-91e4-4681-b503-ad6a119019bc
title: when account usage resets scheduler trigger failed
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__bc79eb8f-91e4-4681-b503-ad6a119019bc.json
policy:
branch: b_310_when_account_usage_resets_scheduler_trigger_failed
worktree: 1
---

Tried to set up a scheduler that would trigger an action. the 'when account usage resets' trigger was selected. for the 'claude' agent and the '5-hour' account usage tracker.

however, nothing happened. Although the account usage indicator clearly showed that the tracker had gone back to 0, no action was started again. so something went wrong, the trigger was not properly detected?

## Findings

The trigger fired and the schedule reached `failed`. The failure occurred while starting the scheduled custom-prompt action.

Manual agent runs send the edited prompt as `runInput.prompt`. Schedule registration currently sends only the action ID, context, and trigger. The persisted action schedule therefore contains no prompt, and `startScheduledAction` starts the action with only a generated `conversationId`. For `md2.custom-prompt`, this leaves the resolved prompt empty.

The scheduler also catches the start error without persisting or reporting it. This hides the cause and makes the failure appear to be a missed trigger.

## Required changes

* Flush the prompt editor before registration and capture its current effective prompt.
* Add an optional `prompt` to the action-schedule registration request and persisted `ActionSchedule`. Existing schedules without it must continue to load and retain their current behavior.
* Pass the persisted prompt to the action runner as `runInput.prompt` when the schedule fires, together with the generated `conversationId`.
* Reject registration of `md2.custom-prompt` when its captured prompt is empty.
* Persist the scheduler's caught error as the action schedule's failure reason and show it in the active-schedule details.
* Existing affected schedules must be recreated because their prompt text was never stored.

## Testing

* Verify that schedule registration flushes and sends the edited prompt.
* Verify that the schedule contract persists and reloads the optional prompt, including an existing schedule without it.
* Verify that a scheduled custom prompt starts with the persisted `runInput.prompt`.
* Verify that an empty custom prompt cannot be scheduled.
* Verify that a start failure is persisted and visible as the schedule failure reason.
