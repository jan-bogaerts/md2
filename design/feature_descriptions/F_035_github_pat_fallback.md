---
id: F-035
title: personal access token fallback for GitHub auth
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

> **UPDATE 2026-07-11 — PAT is now the *only* GitHub auth method.** The device-flow / OAuth path this card was a fallback *alongside* was removed entirely (see [[F_034_github_oauth_cors_proxy]], [[F_001_github_authentication]]). The `authMethod: 'device' | 'pat'` marker and the "Sign in with GitHub" device-flow UI described below are gone; `GithubAuthPanel` offers only the token field.

## Goal
Give users a zero-infrastructure way to authenticate against GitHub storage by pasting a personal access token (PAT), alongside the device-flow login. Useful for self-hosters, development, and as a backup if the OAuth proxy (`F_034`) is ever unreachable.

## Current state
Not implemented. `GithubAuthService` only supports the device flow (`app/src/services/github_auth_service.ts`); `GithubAuthPanel` (`app/src/components/github_auth_panel.tsx`) only offers the device-code sign-in button. `GithubStorageService` already only needs a bare `accessToken: string` (`init({ accessToken })`), so a PAT is a drop-in credential — no storage-layer change required.

## implementation details
- Add a "Use a personal access token" option to `GithubAuthPanel`: a text field for the token plus a Save button (no autosave, matching the app's config editing convention).
- Validate the token by calling the existing `fetchGithubUser` (`app/src/auth/github_api_client.ts`) before accepting it, so a bad/expired token is caught immediately with a clear error rather than surfacing later as a 401 mid-session.
- Persist the token the same way the device-flow token is persisted today (`AUTH_TOKEN_STORAGE_KEY` in `github_auth_types.ts` / `AuthStorage`), so downstream code (`use_github_auth.ts`, `createStorageService`) doesn't need to know which method produced the token.
- Add an `authMethod: 'device' | 'pat'` marker alongside the stored token so the UI can show "Signed in with personal access token" and offer a matching "Remove token" action instead of the device-flow "Sign out" copy.
- Document (in-app helper text, linked from the field) the minimal fine-grained PAT scope needed: Contents (read/write) on the target repo(s); no org-wide or account-wide scopes required.
- Reuse the existing `GithubUnauthorizedError` / `handleUnauthorized` plumbing so a revoked/expired PAT triggers the same re-auth prompt as an expired OAuth token.
- No changes needed to `desktop/github_oauth_proxy.js` or Electron mode — this is a React-layer addition available in both web and Electron builds.

## acceptance criteria
- A user can paste a fine-grained PAT, have it validated against the GitHub API, and immediately use it to open/browse a repository.
- An invalid token shows an inline error and is not persisted.
- The stored PAT survives reload the same way the device-flow token does, and a 401 from any storage call triggers the same unauthorized/re-auth flow as today.
- The auth panel clearly distinguishes "signed in via device flow" from "signed in via personal access token" and offers the correct sign-out/remove action for each.
- Tests cover token validation success/failure, persistence, unauthorized handling, and the panel's method-specific display state.

## see also
- `design\feature_descriptions\F_001_github_authentication.md`
- `design\feature_descriptions\F_034_github_oauth_cors_proxy.md`
- `design\feature_descriptions\B_003_github_401_handling.md`
