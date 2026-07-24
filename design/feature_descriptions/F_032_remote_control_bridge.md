---
id: F-032
title: remote control WebSocket data bridge
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Make "remote control" a real second bridge type, per the architecture: when activated, the Electron app starts a WebSocket server that a remote (browser-hosted) React app can connect to and use as its data service — the same operations the preload bridge offers (project load, commit, actions, agents), transported over WebSocket.

## Current state
Stub only. `desktop/remote_control_service.js` is a hand-rolled WebSocket **echo server**: it accepts connections and reflects text frames back (`socket.on('data', …)` writes the decoded frame straight back). Frames are capped at 125 bytes, there is no ping/pong, no fragmentation and no message protocol. The React side (`app/src/data/electron_remote_control_bridge.ts`, `app/src/components/shell/remote_control_button.tsx`) only exposes start/stop/status of the server. No data operation crosses the WebSocket, and the React app has no WebSocket-backed `StorageService` implementation, so a remote React app cannot control anything.

## implementation details
- Replace the hand-rolled frame handling with the `ws` package (fragmentation, ping/pong, large payloads handled correctly).
- Define a small JSON-RPC-style message protocol: `{ id, method, params }` requests and `{ id, result | error }` responses, plus server-push events (`watchProject` changes, agent run events) as `{ event, payload }` messages.
- On the Electron side, route incoming methods to the same services used by preload. Action starts carry `{ actionId, context, runInput }` and delegate to the Electron action runner; remote clients never send executable action data.
- On the React side, add a `RemoteControlStorageService` implementing `StorageService` (and the action/agent bridge interfaces) over a WebSocket connection, selected when the app is not running inside Electron and the user enters a remote endpoint.
- Add authentication: the server generates a one-time token shown in the desktop UI; the remote client must present it on connect. Refuse non-loopback binds unless a token is set.
- Forward Electron action events as push events keyed by execution id so remote UI gets the same phase, output, cancellation, and conversation updates as local UI.
- Keep the existing start/stop/status IPC and toolbar button; extend status with the token/endpoint the user needs to connect.

## acceptance criteria
- A browser React app (not inside Electron) can connect to the endpoint, open a local project, read/commit files, run actions and see live agent output — feature parity with the preload bridge for all `StorageService` methods.
- Connections without a valid token are rejected.
- Messages larger than 125 bytes and concurrent requests work (no frame-size limitation, responses matched by request id).
- Server push delivers `watchProject` and agent run events to connected clients.
- Tests cover the protocol round trip, method dispatch, token rejection, event push and clean shutdown (server stop closes clients and pending requests fail clearly).

## see also
- `design\architecture\initial description\desktop app.md`
- `design\feature_descriptions\F_013_desktop_app.md`
- `design\feature_descriptions\F_002_data_management.md`
