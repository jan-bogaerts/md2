---
author: 
id: J_33
internalId: 7f35084a-0348-4869-a764-e0ff2ff2843d
title: second instance strange behaviour
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__7f35084a-0348-4869-a764-e0ff2ff2843d.json
policy:
after: db4400c0-0d7f-4265-8939-8b4e493c7208
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.tsx
  - app/src/components/resizable_popover.tsx
  - app/src/components/resizable_popper.tsx
  - app/src/components/shell/project/use_project_toolbar_menu_actions.ts
  - app/src/components/shell/split_layout.tsx
  - app/src/data/project_session.ts
  - app/src/data/recent_local_repositories.test.ts
  - app/src/data/recent_local_repositories.ts
  - app/src/data/remote_control_connection.ts
  - app/src/main.tsx
  - app/src/services/config/config_persistence.ts
  - app/src/services/github/github_auth_service.ts
  - app/src/services/github/github_storage_context.ts
  - app/src/services/sentry/sentry_connection_service.ts
  - app/src/services/storage/application_storage.test.ts
  - app/src/services/storage/application_storage.ts
  - app/src/services/storage/electron_application_state_bridge.ts
  - app/src/theme/use_theme_settings.ts
  - desktop/main.js
  - desktop/src/shell/application_state_store.js
  - desktop/src/shell/application_state_store.test.mjs
  - desktop/src/shell/ipc_channels.js
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
---
When a second instance is started, the app behaves a little strange at startup:

* screen remains blank for a long time
* eventually, main window loads and shows no project loaded
* when trying to load a project, the list with previously loaded folders is emptied, while when the first instance was started, there were items in the list. somehow they got lost

we need to investigate what the problem here is

## Current state

Every launch creates a separate Electron main process, renderer, service graph and `BrowserWindow`. Multiple instances are supported; this feature must not replace them with one primary process.

Two instances of the same build still use the same default Chromium profile on disk. Electron's persistent default session stores `localStorage` under `sessionData`, which defaults to the app's `userData` directory. Development uses package name `desktop`, while the packaged app uses product name `MD²`; therefore one development and one packaged instance use different profiles and do not reproduce the problem. Two development instances or two packaged instances use the same profile and do reproduce it.

Application startup reads durable app state from `window.localStorage` before rendering (`app/src/main.tsx`, `app/src/services/application_startup_service.ts`). This includes the last project in `app/src/data/project_session.ts` and recent folders in `app/src/data/recent_local_repositories.ts`. Theme, React config, authentication, remote connection, Sentry connection, GitHub pending heads and UI sizes also use `window.localStorage`. Two main processes therefore open the same Chromium Local Storage database. Contention delays the second renderer and can make its startup reads return no last project or recent folders.

The desktop main process already uses JSON-backed `electron-store` for desktop configuration (`desktop/main.js`). It is app-owned persistence and does not require both Chromium processes to open one browser-storage database.

## Implementation details

* Keep each launch as an independent Electron main process. Do not call `app.requestSingleInstanceLock()` and do not focus or reuse another instance's window.
* Add a separate `electron-store` JSON file for renderer application state. Keep existing desktop configuration keys in their current store.
* Add preload IPC methods to read, write and remove application-state values. Expose only this storage bridge through `contextBridge`; renderer code must not import `electron-store` or gain Node access.
* Add one renderer storage abstraction. In desktop mode it uses the preload bridge; in browser-only mode it keeps using `window.localStorage`. Replace direct `window.localStorage` access in project session, recent repositories, React config, theme, GitHub authentication and pending heads, remote connection, Sentry connection and persisted UI sizes.
* Load desktop application-state JSON before `ApplicationStartupService` restores authentication and the last project. Reads needed during initial React render, such as theme and startup-splash preference, must come from the already loaded storage snapshot rather than asynchronous reads during rendering.
* Preserve existing keys and serialized value shapes. On first upgraded desktop launch, import known keys from `localStorage` into `electron-store`; after successful import, record a migration marker and stop reading those keys from `localStorage`. Invalid values keep their current validation and discard behavior.
* `electron-store` performs atomic JSON-file replacement. When two instances write the same key concurrently, latest completed write wins. Recent-folder recording must read current stored history immediately before writing its updated five-item list; no cross-instance live UI refresh is required.
* Update existing storage tests to run against the abstraction, add preload/main bridge tests, and add migration coverage. Browser-only tests must retain `localStorage` behavior.

## Acceptance criteria

* Two development instances and two packaged instances each create their own main process, renderer and window without a long blank startup.
* Each instance restores the last project from shared `electron-store` application state.
* Recent local folders remain present and valid after either instance opens a project; starting or closing another instance does not clear them.
* Desktop renderer performs no direct `window.localStorage` reads or writes after migration.
* Existing desktop values migrate once without changing keys or value shapes. Invalid legacy values retain current fallback behavior.
* Browser-only mode continues persisting through `window.localStorage`.
* Simultaneous writes never produce partial or invalid JSON. Writes to the same key use latest-completed-write-wins behavior.
* Existing project-session, recent-repository, config, theme, authentication, connection and persisted-size tests pass through the new storage abstraction. New desktop storage bridge and migration tests pass, and app and desktop lint pass.
