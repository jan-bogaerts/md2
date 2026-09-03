---
author: 
id: J_35
internalId: df937269-dfea-443f-b5e4-ef60704df3b5
title: served browser app always loads same project
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__df937269-dfea-443f-b5e4-ef60704df3b5.json
policy:
branch: j_35_served_browser_app_always_loads_same_project
after: 427d1b08-b9a7-4933-abbb-16c7e60595e1
---

When the desktop app serves the React build over the LAN (remote control), the browser always opens the same project (md2), no matter which project is currently loaded in the desktop app.

## Cause

The browser client restores its own last project from `localStorage` before it ever asks the desktop which project is open.

1. `app/src/services/application_startup_service.ts:93` - startup calls `restoreLastProject` on page load.
2. `app/src/services/project/project_session_service.ts:282` - `restoreLastProject` reads `readLastProject()`, which is the `md2.lastProject` key in browser localStorage (`app/src/data/project_session.ts:7` and `:67`). That entry was written the first time a project was opened in that browser. It then builds its own `RemoteControlStorageService` and activates a session with that stale stored project reference.
3. `app/src/services/project/project_session_service.ts:154` - activating the session calls `remoteConnectionService.setProjectStorageActive(true)`, which also sets `projectFlowHandled = true` (`app/src/services/data/remote_connection_service.ts:169`).
4. `app/src/components/shell/remote_connect_button.tsx:59` - the auto-connect effect then runs `runProjectOpenFlow(() => openRemoteProject(storage))`. That is the only path that calls `storage.getActiveProject()` to learn the desktop's real current project, but `runProjectOpenFlow` (`app/src/services/data/remote_connection_service.ts:174`) returns immediately because the flag is already set, so `getActiveProject` is never asked.

## Second effect: the browser hijacks the desktop's project

`desktop/src/shell/local_bridge_dispatch.js:169` - the `loadProject` handler calls `activateProject(project)` using the project reference supplied by the client. So the stale browser reference does not only display the wrong project, it also switches the desktop's `currentLocalProject`, restarting the worktree service, the action scheduler and the usage pollers on that project.

## Reproduction

1. Open project A in the desktop app and connect a browser to the served app once, so the browser stores project A.
2. Switch the desktop app to project B.
3. Reload the browser page: it still loads project A, and the desktop app switches back to project A.

Confirmation: running `localStorage.getItem('md2.lastProject')` in the browser devtools shows the stale project reference. Clearing that key makes the next page load fall through to the `getActiveProject` path and pick up the desktop's project.

## Possible fixes

* In `restoreLastProject`, when the storage type is `remote`, prefer the server's `getActiveProject()` over the stored reference and fall back to the stored one only when the server returns null.
* Or skip the `projectFlowHandled` short-circuit when the restore came from localStorage, so the auto-connect flow still reconciles against the desktop.
* Optionally, have the desktop `loadProject` handler reject a project reference that is not the active project instead of silently re-activating it, so a client can never switch the desktop's project as a side effect of a read.
