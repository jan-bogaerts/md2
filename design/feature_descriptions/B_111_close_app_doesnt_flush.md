---
author: 
id: B_111
internalId: 43bf8521-8caa-4127-88fc-c31454193b90
title: close app doesnt flush
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__43bf8521-8caa-4127-88fc-c31454193b90.json#conversation=agent-fdd54bb6-71ec-4607-91e7-66ba1a088257
  - design/activity/card__43bf8521-8caa-4127-88fc-c31454193b90.json#conversation=agent-4da6309c-5cc0-4dff-a44f-e8cb7a1153db
policy:
branch: b_111_close_app_doesnt_flush
worktree: 3
---

When the app is about to close, accepted editor changes must reach the shared project persistence flow before the renderer is destroyed. This includes Markdown editor buffers, dirty card documents, action drafts, and the pending commit batch described in [Data saving and commits](../architecture/data_saving_and_commits.md).

## Current state

`ProjectWorkspace` stages mounted Markdown editors and calls `ProjectPersistenceService.flushPendingChanges()`. That service flushes action drafts, copies dirty card documents into the shared `CommitBatcher`, then awaits that batch. Browser hide, blur, and `beforeunload` already start this flow.

Electron only requests renderer flushing from `before-quit`. Clicking a native window close button destroys that renderer first; `window-all-closed` then starts quit with no renderer left to flush. The current IPC handshake also reports success only: renderer failure produces no reply, and the five-second timeout resolves as if flushing succeeded. `flushMarkdownEditors` ignores an editor that refuses to stage its buffer, active storage operations are tracked but not drained, and browser lifecycle handling has no `pagehide` listener.

Here, **stage** means copy editor-only text into its domain draft. **Flush** means stage editor text, validate and persist drafts, drain queued commits and active storage writes, then confirm that no local save remains. A manual pending push is already durable local work and remains separate from Electron close flushing.

## Implementation details

### Shared renderer flow

- Keep `ProjectPersistenceService` as aggregate persistence owner. Its close flush must stage every mounted Markdown editor, flush valid action drafts and dirty card documents, drain `CommitBatcher`, await tracked storage writes, and recheck pending state before reporting success.
- Make editor staging report failure when any editor cannot commit its buffer. Close handling must treat that result as a failed flush. Action preparation must still abort when staging fails; background hide and blur handling must report the failure and retain dirty state.
- Prevent a close attempt from acknowledging success while a newly accepted edit or second commit batch remains pending. A failed or cancelled attempt leaves editor and persistence state available for retry.

### Electron

Native window closing and application quit must use the same coordinated shutdown flow.

1. Intercept each `BrowserWindow` `close` event before renderer destruction. Send a request containing a unique ID and reason (`window-close` or `app-quit`).
2. Extend lifecycle IPC and preload bridge so renderer returns an explicit success or failure result for that request. Renderer reports validation or storage errors through `dialogService`; main process treats renderer destruction, IPC failure, and timeout as failures.
3. On success, mark requested close as approved and close window without re-entering flush handling. During application quit, wait for every live renderer before starting remaining shutdown cleanup.
4. On failure, keep affected windows open and show Retry, Cancel, and Quit Without Saving choices. Only explicit Quit Without Saving bypasses persistence.

One coordinator must own in-flight requests, approved closes, and application-quit state so repeated close events share existing work and successful close does not start a second cycle. OS-forced termination and process crashes remain outside durability guarantee.

Affected Electron boundaries: `desktop/main.js`, `desktop/src/shell/ipc_channels.js`, `desktop/src/shell/preload.js`, `app/src/services/electron_lifecycle_bridge.ts`, and renderer lifecycle registration currently in `app/src/components/project_workspace.tsx`.

### Browser

A browser cannot reliably wait for arbitrary asynchronous persistence after it has accepted page termination. The application must therefore:

- stage editor buffers and start persistence when page becomes hidden, window loses focus, or page receives `pagehide`;
- stage editor buffers again during `beforeunload`;
- request the browser's native leave confirmation while local saves or pushes remain pending;
- continue or retry the flush when the user stays on the page;
- never claim that persistence is guaranteed after the user confirms leaving with pending work.

Normal editing must continue to use automatic batching so termination handlers are a final safeguard rather than the primary save mechanism.

## Acceptance criteria

- Native window close does not destroy renderer until its explicit successful flush result arrives.
- Application quit flushes every live renderer through same coordinator and does not start a second close cycle.
- Validation, storage, staging, communication, and timeout failures keep window open. Only explicit Quit Without Saving bypasses them; Retry starts a new request.
- Close success requires mounted Markdown buffers, dirty card documents, valid action drafts, queued commits, commits queued during an active flush, and active storage writes to be drained.
- Invalid, deleted, conflicted, or failed action drafts remain visible and block close until repaired, discarded, or explicitly bypassed.
- Browser `visibilitychange` to hidden, `pagehide`, blur, and `beforeunload` stage pending editor content and start persistence.
- Browser leave confirmation appears only while a local save or push remains pending after staging.
- Browser-confirmed departure, OS-forced termination, and process crashes are not presented as durability guarantees.

Tests must cover main-process close coordination, IPC success and failure results, preload exposure, renderer flush ordering, all failure choices, browser lifecycle events, and pending-state confirmation behavior.
