---
author: 
id: B_108
internalId: 3e1c301f-4350-413c-b534-e03b0dcee2cc
title: Websocket error
status: ready
owner: 
affects:
agents:
  - design/activity/card__3e1c301f-4350-413c-b534-e03b0dcee2cc.json#conversation=agent-6189e3e6-a6a1-40e9-8751-3303b7a848ad
  - design/activity/card__3e1c301f-4350-413c-b534-e03b0dcee2cc.json#conversation=agent-9021e149-fa8a-44a8-9318-08464e80e90b
policy:
---
When opening the action popup when in the webbrowser connected to electron over websocket, we got this error:

> Preparing action prompts requires the electron app.

Perhaps timing, app was started recently.

## Current state

Web startup and `RemoteConnectButton` can create separate `RemoteControlStorageService` instances. Startup restores the saved remote project, connects, loads desktop config and agent availability, installs the remote action bridge, and loads the project. After the main window mounts, the URL-token auto-connect effect can repeat that sequence with a second service. Connection state is component-local, so the button cannot see the service created during startup.

Prompt preparation reads `getElectronActionBridge()` once. Before remote activation installs the bridge, it throws the Electron-required error. `ActionPromptDraft` then marks preparation failed and cannot retry when the bridge becomes ready. A socket close clears the bridge and config; later action preparation cannot trigger `RemoteControlStorageService` reconnection because that service is no longer exposed as the bridge.

## implementation details

- Add one singleton remote-connection service. It owns connection settings, active `RemoteControlStorageService`, lifecycle, and a stable snapshot consumed through `useSyncExternalStore`. Define **ready** as: socket connected, host desktop config applied, action bridge installed, and agent availability loaded.
- Route startup restoration, URL-token auto-connect, manual connect, and disconnect through that service. Reuse the same ready or in-progress connection for identical settings. `RemoteConnectButton` renders service state and does not start auto-connect or reload the project when startup already connected it.
- On unexpected socket close, clear the stale bridge and start reconnecting without a page reload. Each attempt creates a new `RemoteControlStorageService`; never reuse the closed instance. Try immediately, then use named exponential-backoff delays capped at 30 seconds. Reset delay after success. Explicit disconnect cancels retries.
- Publish the replacement bridge only after its socket and host config are ready. Reload agent availability, then mark the connection ready. Project-session service remains owner of project opening; reconnect must not reopen or replace the already loaded project.
- Make `ActionAgentPromptOwner` subscribe to action-backend readiness. While remote connection is connecting or reconnecting, keep prompt preparation loading instead of reporting an Electron-only error. When readiness becomes true, prepare once with the current bridge.
- Allow a prompt draft that failed because connection disappeared to retry after readiness returns, unless user edited the draft. Keep non-connection preparation errors failed and report them through `dialogService`. Local Electron preparation stays immediate.
- Add focused tests for deduplicated startup/auto-connect, service-backed button state, fresh bridge creation after close, retry cancellation on explicit disconnect, project preservation during reconnect, and popup preparation before and during reconnection.

## acceptance criteria

- Reloading a remote URL creates one WebSocket connection and loads desktop config, agent availability, and project once.
- Connection state survives `RemoteConnectButton` mounts and remounts because service, not component, owns it.
- Opening an action popup before remote readiness shows loading; it prepares automatically after bridge becomes ready and shows no Electron-required error.
- If connection closes during prompt preparation, popup retries through newly created bridge after reconnection. User edits are never overwritten.
- Unexpected connection loss recovers without page reload. New bridge uses a new `RemoteControlStorageService`; stale bridge receives no later requests.
- Reconnection does not reload current project. Explicit disconnect stops reconnection and leaves remote action controls unavailable.
- Permanent prompt-preparation and reconnection errors remain visible and actionable. Local Electron behavior remains unchanged.
