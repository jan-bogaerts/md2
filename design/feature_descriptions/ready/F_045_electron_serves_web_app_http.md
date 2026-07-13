---
id: F-045
title: electron serves the bundled web app over LAN http for phone remote control
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
A phone (or any browser on the LAN) controls the Electron app with zero setup: scan a QR code, the page opens, the app connects. No certificate install, no browser warning, no account, no vendor service — fits md2's simple/free/open-source nature.

## Design
The remote-control HTTP server in `desktop/src/integrations/remote_control_service.js` also serves the bundled React build (the same `app/dist` already packaged with Electron) on GET requests; WebSocket upgrade handling stays as is. One server, one port.

Why plain http works here: the page origin is `http://…`, which is not a secure context, so browsers allow plain `ws://` from it — the mixed-content blocking that forces `wss://` only applies to https-delivered pages. Page and socket are same-origin (same host, same port), so there is no CORS and no endpoint entry: the web app derives the WebSocket URL from `window.location`.

## implementation details
- Serve static files from the packaged React build directory: `/` returns `index.html`, assets resolve relative; reject path traversal; correct content types for js/css/svg/woff2. No directory listing.
- Client auto-connect: the page URL carries the session token in the fragment (`http://<host>:<port>/#<token>` — fragment never reaches the server or logs). When the web app loads with a token fragment and no Electron bridge, it connects immediately to `ws://<location.host>` using that token, skipping the manual connect dialog (F-041 remains for manually entered endpoints).
- QR code and copy-to-clipboard string (F-043) encode this full page URL instead of a bare `ws://` endpoint.
- Document the trade-off: traffic is unencrypted on the user's own LAN; the token still gates access. Note that non-secure contexts lack some browser APIs (async clipboard, service workers) — verify the web app has fallbacks where it uses them.
- Update architecture/desktop docs describing the remote-control server to include static serving and the loopback-to-LAN bind change (F-043).

## acceptance criteria
- With Accept active, a phone on the same LAN scans the QR, the md2 web app loads from the Electron server, and it connects automatically over `ws://` — no typing, nothing installed, no warnings.
- Static serving and WebSocket upgrade coexist on one port; unauthorized WebSocket connects are still refused; max-1 policy (B-046) unaffected.
- Page URLs with a wrong or stale token show the connection error from B-047 instead of silently failing.
- Path traversal requests (e.g. `/../main.js`) are rejected.
- Tests cover static file serving, fragment-token auto-connect, and traversal rejection.

## see also
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
- `design\feature_descriptions\ready\F_041_remote_connect_button_and_dialog.md`
- `design\feature_descriptions\ready\F_043_remote_control_lan_discovery.md`
- `design\feature_descriptions\ready\F_044_remote_control_wss_tls.md` (deferred — not needed for this path)
