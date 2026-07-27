---
id: F-001
title: github authentication
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 29eeeca9-280a-4ce3-b549-de0fc02001d6
---

> **UPDATE 2026-07-11 — device-flow / OAuth login removed.** Auth is now personal-access-token only (see [[F_035_github_pat_fallback]]); the OAuth CORS proxy was dropped (see [[F_034_github_oauth_cors_proxy]]). Any device-flow, `client_id`, scopes, or OAuth-proxy detail below is historical.

## Goal
Allow the user to log in with GitHub credentials so the app can read and write markdown files stored in a GitHub repository.

## Current state
Not implemented. No auth exists yet; the app skeleton (J-001) has no login, no GitHub client, and no token storage. This feature is a prerequisite for the GitHub storage service in [F-002](F_002_data_management.md).

## implementation details
Use the **GitHub OAuth Device Flow** (no client secret, works for a static client-only SPA):

- Register a GitHub OAuth app; its `client_id` ships in the app config. Request scopes needed to read/write repo contents (`repo`, or fine-grained contents read/write).
- Login flow: request a device + user code, show the user code and the `verification_uri` (with a "copy code / open GitHub" button), then poll the token endpoint until the user authorizes (respect `interval` and `slow_down`; handle `authorization_pending`, `expired_token`, `access_denied`).
- **CORS caveat:** GitHub's device/token endpoints do not send browser CORS headers. Route these two calls through the Electron bridge when connected; for the standalone web app, route them through a minimal CORS-passthrough (config-driven URL). No secret is involved, so this stays backend-free.
- Store the resulting access token in an auth service (single source of truth). Persist it (e.g. `localStorage`) so login survives reload; auto-load on start for the "auto-load last project" behaviour.
- Expose `login()`, `logout()` (clear token), current-user info, and `isAuthenticated`. All GitHub API/storage calls read the token from this service.
- Handle token failures centrally: a `401` clears the token and returns the user to the login screen.
- Electron/local-Git mode does **not** use this flow (it works on the local filesystem/git); GitHub auth is only required for the GitHub storage backend.

## acceptance criteria
- An unauthenticated user is shown a "Sign in with GitHub" action; completing the device flow leaves the app authenticated.
- The device flow shows the user code + verification URL, polls correctly, and surfaces pending / denied / expired states without hanging.
- After a successful login the token is persisted and automatically restored on the next app start (no re-login needed until it is revoked/expires).
- Authenticated GitHub API calls succeed using the stored token; the user's login/identity is available to the UI.
- `logout()` clears the stored token and returns the app to the signed-out state.
- A `401` from GitHub clears the token and routes the user back to sign-in.

## see also
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\data management.md`
