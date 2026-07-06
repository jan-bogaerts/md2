---
id: B-008
title: force-commit on close is unreliable
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
F-002 requires "closing forces any pending commit". The `beforeunload` handler in `ProjectWorkspace` fires `void dataService.flushPendingCommits()`, but the browser does not wait for async work during unload — a GitHub commit (network PUT) or even the async IPC git commit will usually be aborted. Edits made in the last ≤30s before closing can be lost silently.

## Fix
- Shorten the loss window rather than fighting unload: flush on `visibilitychange`→`hidden` and on window blur (both allow async completion in most cases), keeping `beforeunload` as last resort.
- When pending commits exist, set `event.preventDefault()`/`returnValue` in `beforeunload` so the browser shows the leave-confirmation, giving the flush time and the user a signal.
- Desktop: on Electron quit, delay window close until the renderer confirms flush (IPC handshake in `before-quit`, with a timeout).
- Show a subtle "unsaved changes" indicator (e.g. in the status bar) while the commit batcher holds pending files.

## acceptance criteria
- Hiding/switching away from the app flushes pending commits.
- Closing with pending commits triggers the browser confirmation; closing without pending commits does not.
- On the desktop app, quitting with pending commits completes the commit before exit (bounded by a timeout).
- Tests cover visibility-based flushing and the pending-state indicator.

## see also
- `design\feature_descriptions\F_002_data_management.md`
