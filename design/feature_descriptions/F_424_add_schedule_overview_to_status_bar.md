---
author: 
id: F_424
internalId: f65510e2-6beb-4c9d-87be-077031583414
title: add schedule overview to status bar
status: ready
owner: 
affects:
agents:
  - design/activity/card__f65510e2-6beb-4c9d-87be-077031583414.json
policy:
changedFiles:
  - app/src/components/shell/active_schedules_indicator.test.tsx
  - app/src/components/shell/active_schedules_indicator.tsx
  - app/src/components/shell/status_bar.tsx
---

it is currently difficult to track if there are cards and/or sequences scheduled.

so we should add a status indicator icon for this on the status bar.

when user clicks on it, show popup with list of current schedules and sequences, same or similar as the one currently shown when accessed from app bar's run tab
## Current state

* `StatusBar` (`app/src/components/shell/status_bar.tsx`) is desktop only (`MainWindow` renders it when not mobile). It holds card count, sync, usage, rate limits, remote control, keyboard, pinned conversations and running agents. No schedule indicator.
* Active schedules are only reachable from app bar → `Run` tab → `Actions` section → `View active schedules` icon button (`app_menu.tsx`). It opens `ActiveSchedulesDialog` (`components/actions/run/schedule/active_schedules_dialog.tsx`), a modal with list, details, `Delete` and `Open`. The button is disabled when no project is open or `hasActiveScheduleBackend()` is false.
* `activeScheduleService` (`services/actions/active_schedule_service.ts`) owns the data. It starts at app startup and reloads when the project changes or when `<actionsFolder>/<ACTION_SCHEDULES_FILE>` changes. Its snapshot `items` holds both action schedules and sequence schedules. "Active" means status `pending` or `running`; the desktop `listActiveSchedules()` filters out the rest. The service publishes the whole snapshot on a single `changed` event, so selection, expand and delete changes in the dialog also fire it.
* Without the Electron bridge (web or remote mode), `hasActiveScheduleBackend()` is false and the service snapshot holds an error with no items.

## Implementation details

* New `app/src/components/shell/active_schedules_indicator.tsx` → `ActiveSchedulesIndicator`:
  * Count: `useSyncExternalStore(activeScheduleService.subscribe, getActiveScheduleCount)` where `getActiveScheduleCount = () => activeScheduleService.getSnapshot().items.length`. Primitive snapshot → the indicator repaints only when the count changes, not when the dialog changes selection or expansion. No service change.
  * Visibility: render `null` when no project is open or `hasActiveScheduleBackend()` is false. Project-open check uses a primitive `useSyncExternalStore` selector (`!!dataService.getState().project`), not `useProjectState`, so that card snapshot changes do not repaint the indicator. Otherwise always visible, including count `0`.
  * Button: same style as `PinnedConversationsIndicator` (neutral pill, `height: 22`, `fontSize: 11.5`), `ScheduleOutlined` start icon, text = count, `aria-label="Active schedules: <count>"`.
  * Click: local `open` state → mount `<ActiveSchedulesDialog open onClose={handleClose} readOnly={readOnly} />` only while open (same lazy-mount pattern as `app_menu.tsx`). `readOnly` comes from `useProjectReadOnly()`. Handlers are named constants.
* `status_bar.tsx`: render `<ActiveSchedulesIndicator />` between `PinnedConversationsIndicator` and `RunningAgentsIndicator`.
* No change to `ActiveSchedulesDialog`, `activeScheduleService`, desktop, or the app bar `Run` tab entry.
* Edge cases:
  * Initial load or error: count shows `0`. The dialog shows the loading spinner or the error alert.
  * Project switch: the service resets to empty and reloads → count follows.
  * Schedule finishes or is deleted: the schedules file changes → service refresh → count drops.
  * Read-only project: dialog opens. `Delete` disabled. `Open` still allowed.
  * Mobile: out of scope (`StatusBar` is not rendered).

## Acceptance criteria

* With a local Electron project open, the status bar shows a schedule icon with the count of pending and running schedules (actions and sequences), `0` included.
* The indicator is hidden when no project is open or the schedule backend is unavailable.
* Registering, finishing or deleting a schedule updates the count without a manual refresh.
* Clicking the indicator opens the same `Active schedules` dialog as the `Run` tab button. Select, expand, `Open`, `Delete` and `Close` behave the same.
* In a read-only project, `Delete` in the dialog is disabled.
* Selecting or expanding rows in the dialog does not re-render the indicator.
* Tests (`active_schedules_indicator.test.tsx`, mock the bridge and service boundaries):
  * renders the count and accessible name;
  * hidden without a project or backend;
  * count updates after a service `changed` event;
  * click opens the dialog; `Close` closes it.
* Existing `status_bar.grouped.test.tsx` keeps passing (no bridge in that test → indicator hidden).
