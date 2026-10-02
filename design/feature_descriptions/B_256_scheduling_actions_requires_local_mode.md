---
author: 
id: B_256
internalId: 21b6ec8e-0455-42ef-9680-36dd39c52fd5
title: Scheduling actions requires local mode
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__21b6ec8e-0455-42ef-9680-36dd39c52fd5.json
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
---

Tried to schedule an action over websocket. Got this error:

> Scheduling actions requires local mode

This is not correct. The scheduler runs in electron, so it should be possible to schedule the action.

## Current state

`ActionScheduleOwner` calls `defaultScheduleAction`, which requires `registerActionSchedule` on the active action bridge. A WebSocket connection installs `RemoteControlStorageService` as that bridge, but the service does not implement schedule registration, listing, or deletion. Registration therefore stops in the renderer with the local-mode error before any WebSocket request. `ActiveScheduleService.refresh` also cannot load the registered schedules. Electron already exposes these methods through `local_bridge_dispatch` and owns schedule persistence, timers, and execution in `ActionSchedulerService`.

## implementation details

* Add `registerActionSchedule`, `listActiveSchedules`, and `deleteSchedule` to `RemoteControlStorageService`, using its existing WebSocket request path and the `ElectronActionBridge` request and response types. Forward calls to the existing desktop dispatcher; keep scheduler state and validation in Electron.
* Keep `defaultScheduleAction` registration followed by active-schedule refresh. On a connected WebSocket client, both calls must use the remote bridge so registration succeeds and the new schedule appears in the active list. Schedule deletion must use that same bridge.
* Preserve the action ID, trigger, and context payload, including `cardInternalId` for card identity. A path identifies a persistence location, not a card. Transport or scheduler failures must reach the existing error handling; do not report successful registration before the desktop confirms it.
* Cover remote request forwarding and response/error handling, registration from the schedule popup, active-list refresh, and deletion with focused tests. Check local Electron registration still works.

## acceptance criteria

* With a connected WebSocket client and writable project, scheduling an action sends its request to the Electron scheduler, persists the schedule, and shows it in the active list without the local-mode error.
* Date/time, account-reset, and card-state triggers retain their existing validation and payloads. A card-state trigger uses `cardInternalId` for the trigger card.
* Deleting an active schedule from the WebSocket client removes it through the Electron scheduler and refreshes the active list.
* If the connection or scheduler fails, registration or deletion reports the failure and does not claim success. Local Electron scheduling continues to work.
