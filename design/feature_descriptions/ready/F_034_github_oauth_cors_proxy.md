---
id: F-034
title: GitHub device-flow CORS proxy for web mode
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Let the web (non-Electron) build of MD² complete GitHub device-flow login without any user-facing backend concept. The client already implements the device flow correctly (`app/src/auth/github_oauth_transport.ts`, `app/src/services/github_auth_service.ts`) and already has a fallback path for it: when there is no Electron auth bridge, `requestViaBrowserProxy` posts to `{oauthProxyUrl}/github/oauth/device/code` and `{oauthProxyUrl}/github/oauth/access_token`. The only missing piece is that proxy. GitHub's device-flow endpoints (`github.com/login/device/code`, `github.com/login/oauth/access_token`) don't send CORS headers, so a browser can't call them directly — a small stateless relay is required, not a full backend. No client secret is involved; device flow only needs the public `client_id`.

## Current state
Not implemented. `GITHUB_OAUTH_PROXY_URL` is read by `github_auth_config.ts` but nothing is deployed at that URL, so web-mode login has no working path (Electron mode works today via `desktop/github_oauth_proxy.js` + preload). We have a small server available to host this.

## implementation details
- Build a minimal HTTP service (reuse the shape of `desktop/github_oauth_proxy.js` — it already does this relay for Electron's local IPC caller) with two routes:
  - `POST /github/oauth/device/code` → forwards to `https://github.com/login/device/code` with `Accept: application/json`, passing through `client_id`/`scope` from the request body, returns GitHub's JSON unchanged.
  - `POST /github/oauth/access_token` → forwards to `https://github.com/login/oauth/access_token` with `client_id`/`device_code`/`grant_type` (device flow's `urn:ietf:params:oauth:grant-type:device_code`), returns GitHub's JSON unchanged.
- Add permissive-but-scoped CORS: allow the app's own origin(s) only (not `*`), `POST`, `Content-Type: application/json`.
- No session state, no database, no cookies, no logging of tokens/device codes (avoid writing secrets to request logs — redact or omit body logging).
- Reject any body field beyond `client_id`, `scope`, `device_code`, `grant_type` — the proxy must not become a general-purpose relay.
- Optional hardening: allow-list the single expected `client_id` server-side so the proxy can't be repurposed for a different GitHub OAuth app; rate-limit by IP to blunt abuse.
- Deploy behind HTTPS on the available small server (plain Node/Express or a lightweight framework is enough — no need for edge/serverless, though either works).
- Set `GITHUB_OAUTH_PROXY_URL` in the web build's environment to the deployed origin; no application code changes are needed since the client already targets this shape.
- Add a health-check route (`GET /healthz`) for uptime monitoring.

## acceptance criteria
- From a browser (no Electron bridge), starting GitHub login successfully retrieves a device code and polls to a token through the deployed proxy.
- The proxy forwards only the documented fields and returns GitHub's response unmodified (including its error shape, e.g. `authorization_pending`, `slow_down`, `expired_token`).
- CORS is restricted to configured app origins; a request from an arbitrary origin is rejected.
- No tokens, device codes, or client secrets appear in server logs.
- Tests cover both routes (success and GitHub error passthrough), CORS rejection of a foreign origin, and body-field allow-listing.

## see also
- `design\feature_descriptions\F_001_github_authentication.md`
- `desktop\github_oauth_proxy.js`
- `app\src\auth\github_oauth_transport.ts`
