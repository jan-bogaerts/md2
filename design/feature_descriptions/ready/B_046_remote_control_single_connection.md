---
id: B-046
title: remote control server accepts unlimited connections instead of max one
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The remote-control WebSocket server (`desktop/src/integrations/remote_control_service.js`) accepts any number of authenticated clients: the `connection` handler just adds the client to the set and increments `clientCount`, and the toolbar label ("Remote N") even anticipates multiples. The intended policy for now is **max one connection**; any further connection attempt must be refused. There is also no way for a refused client to learn *why* it was refused, so the web app cannot show a meaningful "server is occupied" message — every failure surfaces as the generic browser socket error.

## Fix
- Server: when a client is already connected, refuse the next connection. Do it in a way the browser WebSocket API can observe: complete the upgrade, then immediately close with a dedicated close code and reason (e.g. `4409` / `"occupied"`). Browsers hide HTTP upgrade responses, so refusing at the HTTP level (409) would be indistinguishable from a network error on the client.
- Reserve a small set of application close codes (occupied, server stopping) in a shared constants module so client and server stay in sync.
- Client (`app/src/services/remote_control_storage_service.ts`): in `ensureConnected`, listen for the `close` event during the handshake and map the occupied close code to a specific error: "The remote-control server is occupied by another connection." Other close codes keep their current generic handling (see B-047 for broader error differentiation).
- Keep `clientCount` in the status payload (it is 0 or 1 for now) so the Electron UI can render accepting/connected states (see F-042).

## acceptance criteria
- With one client connected, a second authenticated connection attempt is closed immediately with the occupied close code; the first connection is unaffected.
- The web app shows the "server is occupied" error message for that case, not the generic connection failure.
- When the first client disconnects, a new connection is accepted again.
- Tests cover: second-connection refusal, occupied error mapping in the client service, and reconnect-after-disconnect.

## see also
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
- `design\feature_descriptions\ready\B_047_remote_control_connection_errors.md`
- `design\feature_descriptions\ready\F_042_remote_control_accept_ui.md`
