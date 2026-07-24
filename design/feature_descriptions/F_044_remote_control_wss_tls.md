---
id: F-044
title: serve remote control over wss with a locally provisioned certificate
status: deferred
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: ea2940f3-d279-460b-a817-a85029f6ad39
---

> **Deferred.** The chosen path is F-045: the Electron app serves the bundled web app over plain LAN http, so the page is not a secure context and plain `ws://` is allowed — no TLS needed. This spec stays as reference should an encrypted mode ever be wanted.

## Goal
Serve the remote-control endpoint over `wss://` so a web client delivered over HTTPS can connect (browsers block plain `ws://` from HTTPS pages as mixed content), using a certificate provisioned on the Windows machine that runs the Electron app.

## Constraints and clarifications
- **The Windows code-signing certificate cannot be used for TLS.** The paid Authenticode certificate that signs the Electron app carries the Code Signing EKU, not Server Authentication; browsers reject it for TLS regardless of trust. Signing the app and serving `wss://` are unrelated concerns.
- **A certificate from the server machine's Windows store does not help by itself.** TLS trust is decided on the *client* device (the browser connecting from the phone/laptop), not on the machine running the server. Whatever certificate the server presents must chain to a root the *client* trusts.
- **No public CA issues certificates for `.local` names or private IPs**, so a Let's Encrypt-style solution is out for the LAN scenario.

## implementation details
Practical approach — app-managed local CA (mkcert model):
- On first use, the Electron app generates a local root CA (key + self-signed CA certificate) and stores it under the app's user-data directory; from it, issue a server certificate whose SANs cover `<hostname>.local`, the machine's LAN IPs, `localhost`, and `127.0.0.1`. Rotate the server certificate when hostname/IPs change; keep the CA stable. Node's `crypto` plus a small library (e.g. `selfsigned` or direct `node-forge`) is sufficient.
- Start the remote-control server with `https.createServer({ key, cert })` instead of `http.createServer`; endpoint scheme becomes `wss://`.
- Client-side trust: the CA certificate must be installed on each client device. Offer the CA certificate for download/export from the connection-info UI (F-043) and document per-platform install (Windows: user root store via `certutil -user -addstore Root`; Android/iOS: profile install). The QR/copy connect string should carry the `wss://` endpoint.
- Fallback path for clients that cannot install the CA: document visiting `https://<host>:<port>` once in the browser and accepting the warning, which lets the subsequent `wss://` connection through in Chromium and Firefox (not guaranteed everywhere).
- Optionally install the CA into the *server* machine's own trusted store too, so a browser on the same machine works without extra steps — but treat this as convenience, not the mechanism.
- Keep plain `ws://` available behind a setting for the http-served/dev scenario; default to `wss://` once implemented.

## acceptance criteria
- Accept flow serves `wss://`; an HTTPS-delivered web client on another LAN device connects successfully after installing the CA certificate.
- Token auth and the max-1 policy (B-046) behave identically over TLS.
- CA and server certificates regenerate correctly when missing; server certificate re-issues when the hostname/IP set changes.
- Connection-info UI exposes the CA certificate for download and shows the `wss://` endpoint in copy string and QR code.
- Docs cover the trust model (client-side install) and explicitly note the code-signing certificate is not usable for TLS.
- Tests cover certificate generation/SAN contents and a TLS round trip against the generated certificate.

## see also
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
- `design\feature_descriptions\ready\F_043_remote_control_lan_discovery.md`
- `design\feature_descriptions\F-8-signed-windows-electron-package-with-bundled-react-app.md`
