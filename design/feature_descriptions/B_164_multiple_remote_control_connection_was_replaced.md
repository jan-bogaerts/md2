---
author: 
id: B_164
internalId: ed8ce460-5ff7-46f0-8bf2-09764585b8b2
title: multiple remote-control connection was replaced
status: ready
owner: 
affects:
agents:
  - design/activity/card__ed8ce460-5ff7-46f0-8bf2-09764585b8b2.json
policy:
after: 64640333-ea8c-4d4f-b2a4-2d32e74f7545
changedFiles:
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/data/remote_connection_service.service.test.ts
  - app/src/services/data/remote_connection_service.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/data/remote_control_storage_service.ts
  - app/src/services/project/project_session_service.service.test.ts
---
Once the error 'remote-control connection was replaced' is shown, it comes back at a regular interval. seems like the websocket is not stable.

We have myltiple bug repirts for this. See B\_141 'RemoteControlConnectionError: Remote-control connection was replaced'

This occurs on mobilz for instance when app was not in foreground or screen went off.

Once the websocket connection got dropped, only a full reload of the page helps, otherwise the connection remains unstable.

So, the reconnect is wrong. We also need to look at how spread out the reconnects are in the code.

I rhink this will be about the algorithm used and not about adding retries or anything

## Current state

`RemoteConnectionService` handles an unexpected WebSocket close by retiring the active `RemoteControlStorageService`, creating a new instance, reconnecting immediately, then retrying after 1, 2, 4, 8, 16 and at most 30 seconds. `RemoteControlStorageService` separately reconnects from `ensureConnected()` and already restores its project-watch, action-run, rate-limit and worktree subscriptions. Reconnection policy therefore exists in two layers.

Retiring the storage makes every later request through that instance fail with `Remote-control connection was replaced`. After the replacement connects, `DataService` receives the new storage, but project-scoped consumers can still retain the old one. `ProjectAgentTokenUsageService`, for example, captures storage during project load; later action-run refreshes continue through the retired instance. This explains why temporary mobile suspension starts recurring errors and why a full page reload clears them. Desktop server accepts multiple clients and does not generate this replacement error.

## implementation details

* Keep one `RemoteControlStorageService` instance for one configured endpoint and project session. Reconnect its socket after an unexpected close; retire and replace the instance only after explicit disconnect or endpoint change.
* Make `RemoteConnectionService` sole owner of retry timing. `RemoteControlStorageService` owns one socket attempt and subscription restoration; normal requests join the shared connection attempt and must not start a second retry path.
* Replace the unbounded reconnect loop with one cancellable timer per lifecycle. Wait before every retry using capped exponential delays of 1, 2, 4, 8, 16 and 30 seconds; remain at 30 seconds until success. Reset delay only after socket connection and remote activation both succeed.
* Keep the stable storage installed in data, action, config and runtime services while reconnecting. After reconnection, reload remote desktop config and capabilities, recover active action runs, and restore each live server subscription exactly once. Do not restart project loading or replace project storage for a transient socket loss.
* Bind open, error and close handling to the socket that emitted the event. Process closure once and ignore late events from older sockets, so an old close cannot clear a newer connection.
* Reject requests already sent when their socket closes; never replay them because writes may have reached desktop. Requests started during reconnection wait for the shared reconnect result. Explicit disconnect cancels retry timer and waiting requests.
* Update connection and storage lifecycle tests. Add regression coverage using a project-scoped consumer that retains storage, then closes and reconnects the socket without producing `Remote-control connection was replaced`.

## acceptance criteria

* When mobile browser returns after screen-off or background suspension, remote control reconnects without page reload and keeps loaded project.
* Temporary socket loss never replaces active storage instance and never reports `Remote-control connection was replaced` to project refreshes, action events or UI.
* Only one connection attempt or retry timer exists at any time. Failed retries use defined capped delays; successful activation resets delay.
* Project watch, action-run, rate-limit, worktree and merge-conflict subscriptions are restored once after each reconnect, with no duplicate events.
* In-flight requests fail once with `Remote-control connection closed` and are not replayed. Requests begun while reconnecting continue after connection becomes ready or fail when user disconnects or changes endpoint.
* Late close/error events from an old socket do not affect current socket.
* Explicit disconnect stops retries and closes connection. Changing endpoint retires old storage and connects new endpoint.
