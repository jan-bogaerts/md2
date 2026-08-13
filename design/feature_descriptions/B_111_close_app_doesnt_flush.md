---
author: 
id: B_111
internalId: 43bf8521-8caa-4127-88fc-c31454193b90
title: close app doesnt flush
status: design
owner: 
affects:
agents:
  - design/activity/card__43bf8521-8caa-4127-88fc-c31454193b90.json#conversation=agent-fdd54bb6-71ec-4607-91e7-66ba1a088257
  - design/activity/card__43bf8521-8caa-4127-88fc-c31454193b90.json#conversation=agent-4da6309c-5cc0-4dff-a44f-e8cb7a1153db
policy:
---

When the app is about to close, accepted editor changes must reach the shared project persistence flow before the renderer is destroyed. This includes Markdown editor buffers, dirty card documents, action drafts, and the pending commit batch described in [Data saving and commits](../architecture/data_saving_and_commits.md).

## Electron

Native window closing and application quit must use the same coordinated shutdown flow.

1. Intercept the `BrowserWindow` close before its renderer is destroyed.
2. Ask that renderer to flush pending changes and wait for its success response.
3. Close the window only after the flush succeeds.
4. If validation, storage, or communication fails, keep the window open and report the error. A timeout must not be treated as a successful flush; the user may explicitly choose to retry or quit without saving.

The shutdown flow must prevent recursive close handling when it closes the window after a successful flush. It must also cover application-initiated quit while one or more renderer windows still exist. OS-forced termination and process crashes are outside the durability guarantee.

## Browser

A browser cannot reliably wait for arbitrary asynchronous persistence after it has accepted page termination. The application must therefore:

- stage editor buffers and start persistence when the page becomes hidden, loses focus, or receives `pagehide`;
- stage editor buffers again during `beforeunload`;
- request the browser's native leave confirmation while local saves or pushes remain pending;
- continue or retry the flush when the user stays on the page;
- never claim that persistence is guaranteed after the user confirms leaving with pending work.

Normal editing must continue to use automatic batching so termination handlers are a final safeguard rather than the primary save mechanism.

## Verification

Tests must cover:

- native Electron window close waits for renderer flush before destroying the window;
- application quit uses the same flush and does not start a second close cycle;
- flush failure and timeout keep the Electron window open until the user explicitly chooses otherwise;
- Markdown buffers, card drafts, action drafts, and queued commits are included in close flushing;
- browser `visibilitychange`, `pagehide`, blur, and `beforeunload` stage pending editor content;
- browser leave confirmation is requested only while a save or push remains pending.
