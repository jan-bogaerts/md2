---
id: J-015
title: split github_storage_service into focused collaborators
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`app/src/services/github_storage_service.ts` is 855 lines — the last module of its size left after the J-002/J-004..J-014 splits brought everything else to roughly 400 lines or under. It currently bundles several concerns behind one class: authenticated fetch plumbing and error mapping, repository/branch listing, tree and blob traversal for project loading, file save/move/delete with commit batching semantics, manual push handling, and project-config read/write. Changes to any one concern force readers through all of them, and the test file mirrors the same sprawl.

## Fix
Follow the established collaborator pattern (see J-005/J-006): keep `githubStorageService` as the thin facade implementing the storage interface, and extract internal collaborators in the same folder, e.g.:
- a GitHub API client wrapper owning fetch, auth headers, rate/401 error mapping (some of this may merge with the existing `auth/github_api_client.ts` — check before adding a second wrapper);
- tree/content loading (repo + branch listing, tree traversal, blob fetch);
- write operations (save/move/delete, commit construction, push semantics, pending-commit handling);
- project-config IO.

Split the tests along the same lines and move any shared fixtures into `services/test_support` as J-014 did for the data service. Behavior must not change; this is a mechanical extraction.

## acceptance criteria
- No file in the split exceeds ~400 lines; the facade only delegates.
- The storage interface, its observable behavior and all existing tests (adapted to the new files) stay green; typecheck and lint clean.
- No duplicate GitHub fetch wrapper is introduced without a note explaining why `auth/github_api_client.ts` could not be reused.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\ready\J_005_split_data_service_collaborators.md`
- `design\feature_descriptions\ready\J_014_split_data_service_tests.md`
