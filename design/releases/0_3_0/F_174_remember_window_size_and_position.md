---
author: 
id: F_174
internalId: fc4322fa-2432-4365-b355-32cf5e6e6af2
title: remember window size and position
status: ready
owner: 
affects:
agents:
  - design/releases/0_3_0/card__fc4322fa-2432-4365-b355-32cf5e6e6af2.json
policy:
after: f63b1866-ff7a-4fe9-b984-06cf1284f74e
---
When the electron app closes, we should save the window state, position and size so we can restore the settings when the app starts the next time.

This only needs to be done for the electron app.

there should be libraries that do this already for us.

## Current state

`desktop/main.js` creates the Electron app's single `BrowserWindow` with fixed outer dimensions of `1280` by `900`. It provides no `x` or `y` position, so Electron chooses the position. Closing and reopening the app, including recreating the window after macOS activation, does not restore previous window geometry.

The main process already uses `electron-store` for desktop configuration, theme, and spell-check settings, but stores no window geometry and listens to no window move or resize events.

Here, **window geometry** means outer-window position (`x`, `y`) and size (`width`, `height`) in Electron's device-independent pixels. **Window state** means normal or maximized. Minimized and full-screen states are not restored.

## implementation details

* Add `electron-window-state` as a runtime dependency in `desktop/package.json` and update `desktop/package-lock.json`. It owns geometry validation, move and resize tracking, persistence, and maximized-state restoration; do not duplicate this behavior with `electron-store`. Warning: add by running ´npm install´
* In `createWindow()`, initialize the state manager after `app.whenReady()` has resolved. Keep `1280` by `900` as first-run and invalid-state defaults, and pass the manager's `x`, `y`, `width`, and `height` into `BrowserWindow`.
* Call the manager's `manage(window)` after creating the window. Configure maximized restoration on and full-screen restoration off. A minimized window therefore reopens in its previous normal or maximized state, never minimized.
* Persist the last normal bounds rather than maximized screen bounds. When the user closes a maximized window, reopen with its saved normal bounds and then maximize it.
* Let the library store its dedicated state file under Electron's `userData` directory. If saved data is absent, malformed, or no longer fits any connected display, use the default geometry on the primary display so the window remains reachable.
* Keep renderer code, preload IPC, title-bar options, desktop configuration, and browser behavior unchanged. State saving occurs only when the managed Electron window actually closes, so a prevented or cancelled close does not become a completed save.
* With simultaneous app instances, the last window that closes writes the geometry used by the next instance. A persistence write failure must not block app shutdown; the next launch uses the last successfully saved state or defaults.

## acceptance criteria

* First launch, missing state, or invalid state opens the Electron window at `1280` by `900` on the primary display.
* After user moves and resizes a normal window, closes it, and starts the app again, new window has same outer position and size.
* After user closes a maximized window, next launch restores its prior normal bounds and then maximizes it.
* After user closes a minimized window, next launch is not minimized. After user closes a full-screen window, next launch is not full-screen.
* State saved for a disconnected display does not create an unreachable window; startup falls back to default geometry on current primary display.
* Recreating the Electron window after macOS activation uses persisted state through same `createWindow()` flow.
* Browser builds receive no window-state behavior or new dependency.
* Existing Electron startup, renderer loading, navigation guards, title-bar theme, spell checking, close flushing, and packaged Windows build remain functional.
