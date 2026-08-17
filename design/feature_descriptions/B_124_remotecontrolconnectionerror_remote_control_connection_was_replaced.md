---
author: 
id: B_124
internalId: 704af30b-54f1-43ec-b991-39a63e2d52e1
title: RemoteControlConnectionError: Remote-control connection was replaced
status: ready
owner: 
affects:
agents:
  - design/activity/card__704af30b-54f1-43ec-b991-39a63e2d52e1.json#conversation=agent-ebe541e4-f49c-477b-b469-c0ea8e6a8c42
  - design/activity/card__704af30b-54f1-43ec-b991-39a63e2d52e1.json#conversation=agent-6d3dae09-d051-435e-b2e5-9212c32cddc6
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 140874744
sentryOrganization: elastetic
branch: b_124_remotecontrolconnectionerror_remote_control_connection_was_replaced
---
# Goal

## Current state

After unexpected WebSocket closure, `RemoteConnectionService.startReconnecting()` retires old `RemoteControlStorageService`. Successful reconnect creates and activates new storage, then calls `DataService.replaceRemoteStorage()` so loaded project keeps its in-memory state while transport changes.

During replacement, `DataService.initializeStorageServices()` reinitializes `MergeConflictService`. Its previous unsubscribe callback still belongs to retired storage. `RemoteControlStorageService.onMergeConflictSessionChanged()` removes local callback state, then starts fire-and-forget remote `unsubscribe` without handling rejection. `ensureConnected()` sees `retired === true` and correctly rejects with `RemoteControlConnectionError: Remote-control connection was replaced`; missing rejection handler turns expected cleanup into reported Sentry error. Closed socket already removed server-side subscription, so remote unsubscribe is unnecessary.

`onActionRun()` and `onCodexRateLimits()` have same unsafe cleanup pattern when bridge-owning services move from old storage to new storage. Project-watch and worktree cleanup already catch failed unsubscribe requests. Retired-storage guard must remain: normal operations sent through stale transport must still fail fast.

## implementation details

- Add one private best-effort unsubscribe path to `RemoteControlStorageService`. "Best-effort" means local subscription state is always removed; remote `unsubscribe` is sent only while current socket is open, and connection loss during cleanup is consumed because closed socket already discarded subscription.
- Route merge-conflict, action-run, Codex-rate-limit, project-watch, and worktree unsubscribe call sites through that path, including cancellation after subscription response arrives. Keep each public cleanup callback synchronous and idempotent.
- Add missing rejection handling to fire-and-forget merge-conflict subscription setup. Expected close or retirement must not create unhandled promise rejection.
- Do not weaken `ensureConnected()` retired check and do not reconnect retired storage. Requests for project data, actions, config, or runtime state through stale storage keep rejecting with `Remote-control connection was replaced`.
- Keep reconnect order unchanged: connect new storage, activate bridges and subscriptions, replace project transport, restart project watch, then publish `ready`. Do not reload project or change local Electron behavior.
- Add focused `RemoteControlStorageService` tests proving cleanup after retirement sends no request, creates no socket, and creates no unhandled rejection for each subscription type. Keep coverage that active-socket cleanup sends one remote unsubscribe.
- Add reconnect regression coverage with loaded project and active subscriptions. Replacement must preserve project snapshot and bind merge-conflict, action-run, Codex-rate-limit, and project-watch subscriptions to new storage once.

## acceptance criteria

- When remote WebSocket reconnect replaces project storage, connection returns to `ready` without reporting `Remote-control connection was replaced` from subscription cleanup.
- Retired storage cleanup removes local callbacks without opening another socket or sending remote `unsubscribe`.
- Active storage cleanup still sends one `unsubscribe`; repeated cleanup sends none.
- Merge-conflict, action-run, Codex-rate-limit, and project-watch subscriptions attach to replacement storage once and continue receiving events.
- Loaded project and current in-memory snapshot survive transport replacement; reconnect does not reopen project.
- Any normal request made through retired storage still rejects with `RemoteControlConnectionError: Remote-control connection was replaced`.
- Focused regression tests, app unit tests, and app lint pass. Local Electron behavior remains unchanged.

## Sentry issue

**Title:** RemoteControlConnectionError: Remote-control connection was replaced

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/140874744/)

**First seen:** 2026-08-15T16:58:37Z

**Last seen:** 2026-08-15T18:43:34Z

**Occurrences:** 4

**Release:** Not provided

**Environment:** production

**Culprit:** Fm.ensureConnected(assets/index-BZ2bioMw)

**Event ID:** 56af29acae524da2ba497a3073d4a319

### Application stack frames

* `/assets/index-BZ2bioMw.js:185:30313` — async EventTarget.reconnect
* `/assets/index-BZ2bioMw.js:185:29241` — EventTarget.connectOnce
* `/assets/index-BZ2bioMw.js:185:26841` — Object.replaceProjectStorage
* `/assets/index-BZ2bioMw.js:182:5699` — e.replaceRemoteStorage
* `/assets/index-BZ2bioMw.js:182:11752` — e.initializeStorageServices
* `/assets/index-BZ2bioMw.js:180:424` — EventTarget.init
* `/assets/index-BZ2bioMw.js:32:32676` — EventTarget.\<anonymous>
* `/assets/index-BZ2bioMw.js:32:36140` — Fm.request
* `/assets/index-BZ2bioMw.js:32:36238` — Fm.sendRequest
* `/assets/index-BZ2bioMw.js:32:36485` — Fm.ensureConnected

note: occurred in electron-react while another web browser was connected through websocket and change occured in web browser that triggered update in electron-react
