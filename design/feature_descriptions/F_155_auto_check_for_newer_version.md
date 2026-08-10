---
author: 
id: F_155
internalId: 615b2a1f-55c2-4113-b1ac-589ae3474ae2
title: auto check for newer version
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__615b2a1f-55c2-4113-b1ac-589ae3474ae2.json#conversation=agent-599cc38f-625e-4af4-8f7e-0af7c48619a2
policy:
after: bbf61e6e-adfa-46ee-a2f4-040b8152bc4b
branch: f_155_auto_check_for_newer_version
worktree: 3
---
The app is released on github in a public repository. this can normally be checked for new vesions.

When the app starts up, we should have a service that checks if there is a new version ready to download. If there is, a snackbar should inform the user that a new version is available, with an 'install' button. when clicked, download starts in the background. show a progress bar on the snackbar for the download. Don't forget to use large buffers so the download is fast (large file).

When downloaded, launch.

## Current state

No update mechanism exists. `desktop/main.js` bootstraps multiple services (agent runner, action runner, Git, remote control, etc.) at startup but none check for a newer version. The app ships as an NSIS Windows installer via GitHub Releases at [`https://github.com/jan-bogaerts/md2`.](https://github.com/jan-bogaerts/md2.) The packaged version is readable at runtime via `app.getVersion()` (Electron reads it from `package.json`).

## Implementation details

* Add `desktop/src/shell/update_service.js` (Electron main process). On startup — after the main window is ready — fetch [`https://api.github.com/repos/jan-bogaerts/md2/releases/latest`](https://api.github.com/repos/jan-bogaerts/md2/releases/latest) over HTTPS. Compare the response `tag_name` (e.g. `v0.3.0`, strip leading `v`) against `app.getVersion()` by splitting on `.` and comparing each numeric segment. Skip the check entirely when `app.isPackaged === false` (dev mode).
* If a newer version is found, identify the NSIS `.exe` asset from the release's `assets` array (match `browser_download_url` ending in `.exe`). Send an IPC event on a new channel `UPDATE_AVAILABLE_CHANNEL` to the renderer with `{ version, downloadUrl }`.
* Add a new IPC invocation channel `UPDATE_DOWNLOAD_CHANNEL`. When the renderer invokes it, stream the asset from `downloadUrl` into a temp file (`os.tmpdir()`) using Node.js `https` with a write-stream `highWaterMark` of 4 MB. Send incremental `UPDATE_PROGRESS_CHANNEL` events to the renderer with `{ received, total }` bytes so the renderer can compute a percentage. On completion, launch the installer via `shell.openPath(tmpFilePath)` then call `app.quit()`.
* All network errors (DNS failure, HTTP 4xx/5xx, interrupted stream) are caught and swallowed. No error is shown to the user; startup proceeds normally.
* Add the three new IPC channel constants (`UPDATE_AVAILABLE_CHANNEL`, `UPDATE_DOWNLOAD_CHANNEL`, `UPDATE_PROGRESS_CHANNEL`) to `desktop/src/shell/ipc_channels.js`.
* Renderer side: on mount of the root component, subscribe to `UPDATE_AVAILABLE_CHANNEL`. When received, show an MUI `Snackbar` (persistent, no auto-hide) with a message stating the new version number and an **Install** button. When Install is clicked, invoke `UPDATE_DOWNLOAD_CHANNEL` and replace the button with an MUI `LinearProgress` driven by `UPDATE_PROGRESS_CHANNEL` events. When download completes, the snackbar can show a brief "Launching installer…" state before the process exits. If the user dismisses the snackbar before clicking Install, the update is not re-offered until next startup.

## Acceptance criteria

* When the packaged app starts and a newer GitHub release exists, a snackbar appears within a few seconds of the window opening, showing the new version number and an Install button.
* When the current version is already the latest (or newer), no snackbar appears.
* Clicking Install replaces the Install button with a progress bar that advances as bytes are downloaded.
* The download uses a stream buffer of at least 4 MB (`highWaterMark`), so throughput is not limited by small chunk reads.
* When the download finishes, the NSIS installer is launched via the OS and the app quits.
* Any failure during the version check or download (no internet, GitHub API error, partial download) is caught silently — no error message, no crash, app continues normally.
* The version check does not run in dev mode (`app.isPackaged === false`), so development workflow is unaffected.