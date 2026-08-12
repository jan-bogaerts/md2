---
author: 
id: F_176
internalId: 6874b231-0cef-4a8a-8b0b-cc91f3daff42
title: change accept to serve and simplify
status: ready
owner: 
affects:
agents:
  - design/activity/card__6874b231-0cef-4a8a-8b0b-cc91f3daff42.json#conversation=agent-0f40322b-6275-497e-bdf8-dc289a1f5383
  - design/activity/card__6874b231-0cef-4a8a-8b0b-cc91f3daff42.json#conversation=agent-2ea913e3-baf3-461e-a978-f5da649f8ad7
policy:
branch: f_176_change_accept_to_serve_and_simplify
---

## Current state

The Electron app-bar button says **Accept**. Starting it binds one HTTP and WebSocket server to the LAN on an operating-system-selected port. The HTTP side serves the web app; the WebSocket side provides full remote control of projects, files, Git operations, and actions.

Each start creates a new session token. Connection links and QR codes include it as `http://<host>:<port>/#<token>`, and clients must send it as the WebSocket subprotocol. Both token and changing port prevent a stable bookmark.

## implementation details

- Rename inactive Electron button to **Serve** and change its tooltip to describe serving the app for web control. Keep active **Disconnect** behavior and accepting/connected status states.
- Add editable numeric `desktop.remoteControlPort` field to Desktop section of Config dialog. Default: `20877`. Accept integer ports from `1` through `65535`; invalid values block save.
- Persist port with existing desktop config. When saved port changes and server is active, close Config dialog first, then stop and restart server on new port. Cancel, unchanged port, or inactive server causes no restart. If new port cannot bind, leave server stopped and show startup error.
- Start server on configured port instead of port `0`. QR and copy links become stable `http://<host>:<port>/` URLs with no fragment.
- Remove token generation, token status fields, non-loopback token checks, `Sec-WebSocket-Protocol` parsing, and unauthorized WebSocket-upgrade response. A WebSocket upgrade means switching an HTTP connection to persistent WebSocket transport; accept it without credentials while server runs.
- Reduce browser connection settings to endpoint only. Remove token fields from Connect and remote-project dialogs, stop reading/writing token local storage, construct `WebSocket` with endpoint only, and auto-connect Electron-served pages to same-origin WebSocket without a URL fragment.
- Update remote URL helpers, bridge types, connection-info UI, relevant tests, and `design/architecture/initial description/desktop app.md` to match token-free fixed-port behavior.
- Security trade-off: serving exposes full remote-control bridge to any device or process that can reach configured LAN port. No authentication or encryption remains.

## acceptance criteria

- In Electron, inactive app-bar button says **Serve**; clicking it starts HTTP and WebSocket server, while active button still disconnects it.
- Desktop Config shows remote-control port, defaults to `20877`, rejects non-integers and values outside `1`-`65535`, and persists valid value.
- Saving changed port while server runs closes Config dialog, then restarts server on new port. Saving unchanged port, cancelling, or saving while server is stopped does not restart it.
- Bind failure on restart leaves server stopped and produces visible error.
- Connection popover and QR contain `http://<host>:<configured-port>/` without token or fragment. Same bookmark works after server restart when port remains unchanged.
- Browser loaded from served URL connects automatically to same-origin WebSocket without token. Manual connection and remote-project flows require endpoint but no token.
- Server accepts tokenless WebSocket clients. Status payloads, browser settings, local storage, dialogs, URLs, and WebSocket construction contain no session token.
- Tests cover button wording, port validation and persistence, active-server restart timing, bind failure, tokenless upgrade, stable URL/QR generation, endpoint-only manual connection, and fragment-free auto-connect.
