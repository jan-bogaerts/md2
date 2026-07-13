---
id: F-043
title: LAN-reachable remote control with hostname display, copy button and QR code
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Make the server address easy to enter on the client. Tier-1 approach (no service-advertisement dependency): bind the server so LAN devices can reach it, present the endpoint as the machine's mDNS hostname (`ws://<hostname>.local:<port>`) with the raw IP address as fallback, and offer copy-to-clipboard plus a QR code so the user never types the address by hand.

## Current state
`desktop/src/integrations/remote_control_service.js` binds to `127.0.0.1` by default, so nothing on the LAN can connect at all. `getStatus()` reports `ws://127.0.0.1:<port>`. The endpoint and token are only shown in a hover tooltip; there is no copy button and no QR code. mDNS-based *discovery* (browsing for advertised services) was considered and rejected for now: browsers have no mDNS API, so a web client cannot list servers — advertisement would buy nothing over the hostname display.

## implementation details
- Change the default bind for the accept flow to `0.0.0.0` (token auth is already mandatory-capable; keep the existing rule requiring a token for non-loopback binds and always generate one). Update the architecture/desktop docs that currently describe the loopback default.
- Extend `getStatus()` to return, alongside the port: the mDNS name (`os.hostname()` lowercased + `.local`) and the machine's IPv4 LAN addresses (`os.networkInterfaces()`, skipping internal and link-local). Primary suggested endpoint: `ws://<hostname>.local:<port>`; fallbacks: `ws://<ip>:<port>` per address. `.local` resolution can fail on some networks (VPN, multicast-blocking routers, some Android browsers), hence the IP fallback must stay visible.
- Connection-info UI in the Electron app (dialog or popover from the Accept button, see F-042):
  - hostname endpoint shown prominently, IP endpoint(s) beneath;
  - **copy-to-clipboard button** that copies a single self-contained connect string: the page URL of the Electron-served web app with the token in the fragment (`http://<host>:<port>/#<token>`, see F-045); opening it in a browser loads the app and auto-connects, and the web connect dialog of F-041 also parses it from a single paste;
  - **QR code** encoding the same URL, rendered with a small dependency-light library (e.g. the `qrcode` npm package generating a data URL) — phone scans it, page opens, connects.
- The web connect dialog (F-041) accepts the pasted connect string and splits it into endpoint + token automatically.

## acceptance criteria
- With Accept active, a browser on another LAN device can connect using the displayed hostname endpoint, or the IP endpoint when `.local` does not resolve.
- Copy button places the complete connect URL on the clipboard; opening it in a LAN browser loads the app and connects, and pasting it into the web connect dialog fills endpoint and token in one step.
- QR code decodes to the same URL.
- Status payload includes hostname and IP endpoints; docs no longer claim a loopback-only default.
- Tests cover status shape (hostname + IPs), connect-string round trip (build in desktop, parse in web dialog), and the non-loopback token requirement.

## see also
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
- `design\feature_descriptions\ready\F_041_remote_connect_button_and_dialog.md`
- `design\feature_descriptions\ready\F_042_remote_control_accept_ui.md`
- `design\feature_descriptions\ready\F_045_electron_serves_web_app_http.md`
