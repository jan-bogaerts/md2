---
id: B-003
title: 401 from storage calls does not clear token or return to sign-in
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 002834d0-f38b-4d36-82b5-aba8c6d3ee82
---

## Problem
F-001 requires central token-failure handling: "A `401` from GitHub clears the token and routes the user back to sign-in." Only `fetchGithubUser` (`app/src/auth/github_api_client.ts`) raises `GithubUnauthorizedError`; `GithubStorageService.request` throws a generic `Error` for any non-ok status, including 401, and never notifies `githubAuthService`. With a revoked/expired token the user just sees "GitHub storage request failed with status 401" on every operation and is never returned to the login screen.

## Fix
- `GithubStorageService.request` throws `GithubUnauthorizedError` on 401 (and optionally 403 with token-related response bodies).
- Handle it centrally: either the storage service accepts an `onUnauthorized` callback wired to `githubAuthService.handleUnauthorized()` at construction (in `project_session.createStorageService`), or callers of `DataService` map the error type — pick one central place; do not scatter per-call checks.
- After `handleUnauthorized()` the auth panel already shows the "sign in again" state; verify project state degrades gracefully (project stays loaded read-only or is closed with a message).

## acceptance criteria
- Any GitHub storage call returning 401 clears the stored token and shows the signed-out/sign-in-again state.
- Non-401 failures keep their current error surfacing.
- Regression test: a mocked 401 during `openProject` and during a batched commit both trigger `handleUnauthorized` exactly once.

## see also
- `design\feature_descriptions\F_001_github_authentication.md`
- `design\architecture\class_relationships.md`
