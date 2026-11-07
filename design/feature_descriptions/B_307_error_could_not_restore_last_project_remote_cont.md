---
author: 
id: B_307
internalId: 449b8fa8-9d5e-4d00-9b81-66a018e55285
title: Error: Could not restore last project: Remote-cont
status: ready
owner: 
affects:
agents:
  - design/activity/card__449b8fa8-9d5e-4d00-9b81-66a018e55285.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 144540255
sentryOrganization: elastetic
after: f3b7a6f7-0cc4-4d30-994b-026f9d5d8092
changedFiles:
  - app/src/App.test.tsx
  - app/src/components/shell/remote_connect_button.grouped.test.tsx
  - app/src/components/shell/remote_connect_button.test.tsx
  - app/src/components/shell/remote_connect_button.tsx
  - app/src/services/application_startup_service.test.ts
  - app/src/services/application_startup_service.ts
---

## Current state

When the last project uses remote storage, startup creates a `RemoteControlStorageService` and attempts to restore the WebSocket connection before opening the project. If the remote desktop is unavailable, the connection rejects with `RemoteControlConnectionError: Remote-control connection failed`.

`ApplicationStartupService` treats this expected connectivity failure like any other project restoration failure. `App` then passes the composed restore message to `dialogService.error`, which reports it to Sentry. Because the reported value is a string rather than the original error, the event has no application stack frames.

`RemoteConnectionService` already owns remote connection status and its user-visible error. `RemoteConnectButton` also attempts the same-origin connection when it mounts and opens its connection dialog when that attempt fails. The generic restore dialog and Sentry event therefore duplicate the remote connection flow.

## Implementation details

- In `ApplicationStartupService`, treat `RemoteControlConnectionError` from initial project restoration as a recoverable startup outcome. Continue startup with no restored project resolution instead of setting `bootstrap.error`.
- Continue the remaining startup work, including the startup model-catalog refresh, after a recoverable remote connection failure.
- Keep the error in `RemoteConnectionService`, which already publishes the disconnected state and connection message.
- Make `RemoteConnectButton` open the remote connection dialog when it mounts with a disconnected snapshot containing an error. The existing same-origin connection attempt and manual retry behavior remain responsible for reconnecting and opening the remote project.
- Do not suppress other project restoration errors. They must continue through the existing bootstrap error dialog and Sentry reporting path.
- Add focused tests for recoverable remote startup failure, completion of the remaining startup work, connection-dialog presentation, retry, and continued reporting of unexpected restore failures.

No desktop-host or remote-control protocol change is required.

## Acceptance criteria

- An unavailable remote desktop during last-project restoration does not show `Could not restore last project: Remote-control connection failed`.
- The expected initial remote connection failure is not reported to Sentry.
- Startup completes and the main window becomes available after the connection failure.
- The remote connection dialog shows the connection failure and allows the user to retry.
- A successful retry connects to the remote desktop and opens its active project through the existing flow.
- Startup work after project restoration still runs when the remote connection is unavailable.
- Non-connection project restoration failures retain the existing restore dialog and Sentry reporting behavior.

## Sentry issue

**Title:** Error: Could not restore last project: Remote-control connection failed

**Message:** Could not restore last project: Remote-control connection failed

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/144540255/)

**First seen:** 2026-09-24T16:49:10Z

**Last seen:** 2026-10-13T19:41:46Z

**Occurrences:** 3

**Release:** Not provided

**Environment:** production

**Culprit:** Not provided

**Event ID:** 9e9e421695db42d1ba85a12e6dc2d826

### Application stack frames

- No application stack frames provided.
