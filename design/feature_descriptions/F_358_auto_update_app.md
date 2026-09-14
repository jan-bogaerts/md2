---
author: 
id: F_358
internalId: cf3ba1a5-1822-4aed-9626-f7107f677bac
title: auto update app
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__cf3ba1a5-1822-4aed-9626-f7107f677bac.json
policy:
---
The app is released on github: [https://github.com/jan-bogaerts/md2](https://github.com/jan-bogaerts/md2)

It has official releases. I believe we can do an automatic update from github.&#x20;

so lets add a service that checks if there is a new version available. if so, show the user a snackbar with a button to download and start the installation of the new version

## Current state

A first implementation already exists. On packaged Electron startup, `desktop/src/shell/update_service.js` requests the latest GitHub release, compares its tag with `app.getVersion()`, selects the first `.exe` asset, and sends update data through the preload bridge. `UpdateNotification` then shows a persistent snackbar, downloads the installer to the temporary directory, reports progress, opens the installer, and quits the app. Browser and development runs skip the check.

This path is not complete. Availability is sent once without a stored snapshot, so a fast response can arrive before React subscribes. Renderer code sends the executable URL back to Electron, although Electron should retain ownership of that trusted URL. Download and launch failures are hidden, `shell.openPath()` failures are not checked, and the renderer component owns update state instead of a service.

## Implementation details

* Keep release lookup, selected installer URL, download, and launch in an Electron update service. Renderer must request installation without supplying a URL.
* Check once per packaged-app startup after Electron is ready. Request [`https://api.github.com/repos/jan-bogaerts/md2/releases/latest`](https://api.github.com/repos/jan-bogaerts/md2/releases/latest), compare numeric version segments with `app.getVersion()`, and accept only the signed Windows x64 asset named `MD2-Setup-<version>-x64.exe`.
* Store current update snapshot so renderer can read it after mounting. A snapshot is current update state, version, and download progress at one moment. Send granular IPC notifications when that snapshot changes; expose only scoped read, subscribe, dismiss, and install operations through preload.
* Add renderer update service owning `idle`, `available`, `downloading`, `launching`, and `error` states. `UpdateNotification` subscribes with `useSyncExternalStore` and only renders service state.
* Show persistent bottom-right snackbar for `available`. Include released version, secondary `Dismiss` button, and primary `Install` button. Dismissal suppresses that release until next app start.
* On `Install`, disable repeat installation, stream installer into OS temporary directory, and show determinate progress when total bytes are known or indeterminate progress otherwise. Follow a bounded number of HTTPS redirects.
* Launch installer only after download completes. Treat a non-empty `shell.openPath()` result as failure. Quit through existing coordinated shutdown only after installer launch succeeds; otherwise keep app running, remove partial download, and show retryable error in snackbar.
* Release-check failures remain silent because they happen without user action. Download or launch failures are shown because they follow explicit user action.

## Acceptance criteria

1. Each packaged-app startup checks GitHub once after update bridge can provide its current snapshot. Browser and development runs make no release request and show no update UI.
2. A release with a strictly newer numeric version and exact Windows x64 installer shows persistent snackbar containing released version, `Dismiss`, and `Install`. Equal, older, malformed, or installer-less releases show nothing.
3. Renderer cannot choose or alter installer URL. Install request uses candidate retained by Electron from fixed GitHub repository response.
4. Dismissing offer closes it and prevents same release from reappearing until app restarts.
5. Selecting `Install` starts one download, replaces buttons with progress, follows no more than configured redirect limit, and never starts second concurrent download.
6. Successful download starts installer, then invokes existing coordinated app shutdown. App does not quit when download or installer launch fails.
7. Failed download or launch removes partial temporary file, keeps current app usable, and shows error with retry action. Startup check failures remain silent.
8. Tests cover version comparison, exact asset selection, late renderer subscription, bridge URL isolation, redirect bound, progress, dismissal, retry, temporary-file cleanup, successful launch, and failure without app quit.