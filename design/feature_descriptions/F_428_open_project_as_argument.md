---
author: 
id: F_428
internalId: 03d0a58e-10e5-403f-bba2-585bd1445fd4
title: open project as argument
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__03d0a58e-10e5-403f-bba2-585bd1445fd4.json
policy:
after: b6bfdd41-b224-4656-8ba0-12c841e72bac
---
lets accept a folder as an argument for starting the application so the user can open a project directly. This should also allow for opening projects directly from the windows taskbar icon's context menu

## Current state

* `desktop/main.js` ignores command-line arguments. `createWindow()` passes only bridge origins, trusted location and desktop config to the preload via `webPreferences.additionalArguments`; `desktop/src/shell/preload.js` reads them with `readArgumentValue`.
* Development start `desktop/start_electron.js` spawns `electron .` and drops its own arguments. In development `process.argv` is `[electron.exe, '.', ...]`; packaged it is `[md2.exe, ...]`.
* Every launch is an independent main process; there is no `app.requestSingleInstanceLock()` (J_33). Instances share the `application-state` `electron-store` JSON file (`desktop/src/shell/application_state_store.js`); values are JSON strings.
* Renderer startup: `ApplicationStartupService.runStartup()` (`app/src/services/application_startup_service.ts`) always calls `projectSessionService.restoreLastProject()`, which reads `md2.lastProject`. A failure is shown by `app/src/app.tsx` as "Could not restore last project: …", unless `isProjectLoadErrorReported` says `ProjectSessionService` already reported it.
* Local open: `ProjectOpenFlowService.openLocalPath()` (`app/src/services/project/project_open_flow_service.ts`) validates via bridge `resolveProject` → `resolveLocalProject` (`desktop/src/git/git_commands.js`), which rejects missing folders and folders outside a Git work tree. `openResolvedProject()` opens the project and, on full open, records the root in `md2.recentLocalRepositories` (newest first, max 5, case-insensitive unique) via `recordRecentLocalRepository`. A folder-setup resolution records the root only after `confirmFolders()`. `activateProjectSession()` writes `md2.lastProject` on every successful open.
* The open dialog shows when `projectOpenFlowService` phase is `selecting` or `folder-setup` (`app_menu.tsx`); the service state survives before the dialog mounts.
* No Jump List exists. Jump List = Windows right-click menu of the taskbar/Start icon. No `app.setAppUserModelId()` call exists. AppUserModelID (AUMID) = Windows id that links a running process to its pinned shortcut; the NSIS shortcut uses `appId` `io.md2.desktop` (`desktop/packaging/builder_config.js`).

## Implementation details

### Startup argument (main process)

* New `desktop/src/shell/startup_project_argument.js`: `readStartupProjectPath(argv, isPackaged)` skips `argv[0]` (packaged) or `argv[0..1]` (development), takes the first argument not starting with `-` (Chromium switches) and returns it as `path.resolve()`d path; else `null`. No filesystem or Git check here.
* `main.js` reads the path once at startup and passes it to the first `createWindow(startupProjectPath)`. `createWindow` adds `--md2-startup-project=<encodeURIComponent(path)>` to `additionalArguments` only when set. The macOS `activate` window gets `null`.
* `start_electron.js` forwards its arguments: `spawn(electron, ['.', ...process.argv.slice(2)])`, so `npm start -- "C:\repo"` works in development.

### Startup open (renderer)

* `preload.js` decodes `md2-startup-project` and exposes `getStartupProjectPath()` (returns `string | null`) on `md2Data`. Add optional `getStartupProjectPath?(): string | null` to `ElectronDataBridge` (`app/src/data/electron_data_bridge.ts`).
* `ApplicationStartupDependencies` gets `readStartupProjectPath()` and `openStartupProject(rootPath)`. `runStartup()`: when a startup path exists, call `openStartupProject(rootPath)` instead of `restoreLastProject()` and set `projectOpenResolution: null`; otherwise unchanged. The argument wins over the last project.
* New `ProjectOpenFlowService.openStartupProject(rootPath)`:
  * resolve via bridge `resolveProject({ branch: '', id: rootPath, rootPath })`, then `projectSessionService.openProject('local', project, null)`;
  * full open → `recordOpenedLocalProject()` (refreshes Jump List, see below); `md2.lastProject` is written by existing `activateProjectSession()`;
  * folder-setup resolution → set `pendingLocalRootPath` and phase `folder-setup`, so `confirmFolders()` records the root as today;
  * failure (missing folder, not a Git work tree, load error) → report through `dialogService.error(error, { fallbackMessage: 'Could not open project folder' })` unless `isProjectLoadErrorReported(error)`, then `show({ source: 'local' })`. No rethrow; startup still ends in `ready` with no project, and "Could not restore last project" is not shown.
* Browser/remote mode has no `md2Data` bridge → no startup path → unchanged.

### Jump List (main process)

* New `desktop/src/shell/recent_projects_jump_list.js`, registered from `main.js` in `app.whenReady()` with `app` and `applicationStateStore`. Does nothing unless `app.isPackaged && process.platform === 'win32'`.
* On registration call `app.setAppUserModelId('io.md2.desktop')` (constant with comment "must match builder `APP_ID`"; runtime must not require `packaging/builder_config.js`). Needed so Windows attaches the Jump List to the pinned icon.
* Build list from `md2.recentLocalRepositories` (parse JSON string; invalid value → empty list and `captureError`). One custom category `Recent projects`; per root one `task` item: `title` = folder basename (full path when basename is empty, e.g. drive root), `description` = full path, `program` = `process.execPath`, `args` = quoted root path, `iconPath` = `process.execPath`, `iconIndex` = 0. Empty list → `app.setJumpList(null)`.
* Apply at registration and on `applicationStateStore.onDidChange('md2.recentLocalRepositories', …)`. Renderer writes go through main IPC, so each instance's own record/remove triggers an update. The Jump List is shared per AUMID; latest writer wins, and every writer uses the full stored list, so instances converge.
* `setJumpList` result other than `'ok'` (e.g. `customCategoryAccessDeniedError` after the user removed an item) → `captureError`, continue.
* Clicking an item starts a new instance with the folder argument (no single-instance lock). Opening a project already open in another instance is allowed, as today via the recent list.

### Edge cases

* Extra Chromium switches in `argv` are ignored; only the first non-switch argument counts.
* Relative path resolves against the process working directory; Jump List always passes absolute paths.
* Folder deleted after it entered the Jump List → failure path (error + open dialog); the entry stays until the user removes it from the recent list.
* Subfolder of a repository → `resolveLocalProject` opens the work-tree root, same as the folder picker.

### Tests

* `desktop/src/shell/startup_project_argument.test.mjs`: packaged and development `argv`, switches skipped, no argument → `null`, relative path resolved.
* `desktop/src/shell/recent_projects_jump_list.test.mjs` (mocked `app`, store): no-op when unpackaged; item shape; empty list → `null`; invalid JSON reported; `onDidChange` re-applies; non-`'ok'` result reported.
* `desktop/src/shell/preload.test.mjs`: `getStartupProjectPath()` decodes argument; `null` when absent.
* `app/src/services/project/project_open_flow_service.test.ts`: `openStartupProject` full open records recent root; folder-setup records only after confirm; resolve failure reports error and shows phase `selecting` with source `local`.
* New `app/src/services/application_startup_service.test.ts`: startup path → `openStartupProject` called, `restoreLastProject` not called; no path → `restoreLastProject` called.

## Acceptance criteria

* `md2.exe "C:\repo"` (packaged) and `npm start -- "C:\repo"` (development) start MD² with that project open instead of the last project.
* After that open, `md2.lastProject` and the top of the recent local folders list are `C:\repo`.
* A folder without project config opens the folder-setup dialog; after confirm the root is in the recent list.
* Missing folder or a folder outside a Git work tree: startup shows an error via `dialogService`, then the open-project dialog on the local source; no "Could not restore last project" error.
* Starting without a folder argument keeps current last-project restore.
* Packaged on Windows: right-click on the taskbar icon shows `Recent projects` with the up-to-5 recent local folders, newest first, updated after opening or removing a recent folder.
* Clicking a Jump List entry starts a new MD² instance that opens that folder; running instances are unaffected.
* Development (unpackaged) mode does not set or change the Jump List.
* `setJumpList` failures are reported and never block startup.
* New and updated tests pass; app and desktop lint pass.