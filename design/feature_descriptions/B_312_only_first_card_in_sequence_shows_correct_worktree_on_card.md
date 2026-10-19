---
author: 
id: B_312
internalId: 349bbb7d-ab48-4ef5-85df-3f6caf2fd460
title: only first card in sequence shows correct worktree on card
status: ready
owner: 
affects:
agents:
  - design/activity/card__349bbb7d-ab48-4ef5-85df-3f6caf2fd460.json
policy:
after: e92bddab-43a2-497f-8493-cfa6f39a089e
---
When the second card started in the sequence, it did not show the correct worktree number in the icon on the card

## Analysis

The app never reloads the schedule list after the first refresh, so the card indicator keeps showing the sequence state from when card 1 was running. Card 1 keeps the sequence worktree, and card 2 never gets it.

* `ActiveScheduleService.handleRepositoryChanged` (`app/src/services/actions/active_schedule_service.ts`) only calls `refresh()` when a watch event path equals `${getActionsFolder()}/.md2-schedules.json`.
* `getActionsFolder` is defined as `configService.getProjectConfig().actionsFolder`. This is the raw config value (`actions`), not joined with `projectFolder` (`design`).
* The desktop watcher (`watchProject` in `desktop/src/project/project_files.js`) reports paths relative to the repository root, so the event path is `design/actions/.md2-schedules.json`. The paths never match, and the app never reloads schedules from watch events.
* Card 1 only looks correct because `card_sequence_registration.ts` calls `activeScheduleService.refresh()` once, right after the sequence is registered.
* The card indicator gets the sequence worktree only for `cardInternalIds[currentIndex]` (`setSchedules`), so a stale `currentIndex` leaves the worktree on card 1.

B\_313 (sequence progress stuck on card 1 in the sequences overview dialog, deleted now) had the same root cause. `active_schedules_dialog.tsx` renders `currentIndex` from the same stale snapshot. This card fixes both bugs.

## Fix

* In `active_schedule_service.ts`, resolve the actions folder the same way the rest of the app does: `getActionsFolder: () => resolveProjectConfigPaths(configService.getProjectConfig()).actionsFolder`. `getActionsFolder` has no other callers.
* Add a regression test in `active_schedule_service.node.test.ts`: with `projectFolder` set to `design` and `actionsFolder` set to `actions`, a watch event for `design/actions/.md2-schedules.json` reloads the schedules, moves the sequence worktree from card 1 to card 2, and advances `currentIndex` in the snapshot (the value behind the B\_313 progress text).
