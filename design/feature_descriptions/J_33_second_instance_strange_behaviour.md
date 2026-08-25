---
author: 
id: J_33
internalId: 7f35084a-0348-4869-a764-e0ff2ff2843d
title: second instance strange behaviour
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__7f35084a-0348-4869-a764-e0ff2ff2843d.json
policy:
after: db4400c0-0d7f-4265-8939-8b4e493c7208
---

When a second instance is started, the app behaves a little strange at startup:

* screen remains blank for a long time
* eventually, main window loads and shows no project loaded
* when trying to load a project, the list with previously loaded folders is emptied, while when the first instance was started, there were items in the list. somehow they got lost

we need to investigate what the problem here is

## Current state

`desktop/main.js` does not call Electron's `app.requestSingleInstanceLock()`. A single-instance lock is operating-system coordination that selects one primary app process and redirects later launches to it. Today every launch instead creates its own `electron-store`, desktop services, IPC handlers and `BrowserWindow` against the same Electron user-data directory.

Each renderer starts `ApplicationStartupService` before React renders (`app/src/main.tsx`). Startup initializes services, restores authentication and then restores the last project from `md2.lastProject` (`app/src/services/application_startup_service.ts`, `app/src/data/project_session.ts`). Until that work finishes, `App` shows the startup splash or renders no main window content when the splash preference is disabled (`app/src/app.tsx`). Concurrent startup against one Chromium profile explains the long blank state and the second renderer reaching the ready phase without a project.

Recent local folders are also renderer-profile data. `app/src/data/recent_local_repositories.ts` stores them in `window.localStorage` under `md2.recentLocalRepositories`; it removes that key only when stored JSON is malformed. No project-open path intentionally clears valid history. Loss seen after a second launch therefore occurs while two Electron processes access the same profile, not through normal recent-folder handling.

## Implementation details

- Acquire `app.requestSingleInstanceLock()` at the start of `desktop/main.js`, before constructing stores, services, telemetry, IPC handlers or a window. If acquisition fails, call `app.quit()` and skip every remaining startup side effect. Secondary process must never load renderer or touch project-session storage.
- In primary process, register Electron's `second-instance` event. Find existing main window through `BrowserWindow.getAllWindows()`. Restore it when minimized, show it when hidden, then focus it. If primary window no longer exists, create one through existing `createWindow()` path.
- Keep first-instance `app.whenReady()`, `activate`, update, close-coordination and telemetry behavior unchanged. Do not move `md2.lastProject` or `md2.recentLocalRepositories` to `electron-store`; preventing concurrent renderers removes shared-profile race without changing persistence ownership.
- Put testable single-instance window activation logic in a plain shell helper under `desktop/src/shell/`, not a service class. Add focused Vitest coverage for minimized, hidden, focused and missing-window cases. Keep lock acquisition in entry point so it runs before startup dependencies.
- Verify both development launch and packaged Windows launch. Lock identity and handoff must work for either launch path, and normal relaunch must work after primary process exits and releases lock.

## Acceptance criteria

- First launch creates one window and restores last project through existing startup flow.
- Starting app again while primary process runs creates no second window or renderer and starts no secondary desktop services.
- Second launch restores, shows and focuses primary window; already visible window is focused without creating another window.
- When primary window is absent but primary process still owns lock, second launch creates exactly one replacement window.
- `md2.lastProject` and `md2.recentLocalRepositories` remain unchanged after repeated second-launch attempts; loaded project and recent-folder list remain visible.
- After primary process exits, next launch acquires lock and starts normally.
- New single-instance helper tests pass, and desktop lint passes.
