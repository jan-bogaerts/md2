---
id: B-042
title: createStorageService silently rewires the action bridge
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 9e7d8cb7-61af-4333-abe9-a4c8cd5ef200
---

## Problem
`createStorageService` (`app/src/data/project_session.ts`) does more than construct a storage backend: as a side effect it calls `setActionBridgeOverride(storage)` for remote storage and `setActionBridgeOverride(null)` otherwise, mutating the global action-bridge singleton. Callers cannot tell from the signature that choosing a storage type also redirects where actions execute; a future caller constructing a storage service for any secondary purpose (probing, tests, migration) would silently break action routing for the whole app. Hidden global mutation from a factory function violates the codebase's explicit-wiring style (services registered via `service_injector`, dependencies passed in `init`).

## Fix
- Make the wiring explicit at the single place a storage becomes *the* active storage: move the `setActionBridgeOverride` calls out of the factory and into the project-session/bootstrap flow that already calls `dataService.init({ storage })` (`projectSessionService` / `use_app_bootstrap`), immediately next to that call.
- Alternatively, have `dataService.init` accept an optional `actionBridge` and own the override, so "active storage" and "active action bridge" change atomically in one call.
- `createStorageService` becomes a pure factory; document that expectation in its doc comment.

## acceptance criteria
- `createStorageService` performs no global mutation (grep: `setActionBridgeOverride` appears only in the activation path).
- Opening GitHub/local/remote projects still routes actions correctly (remote uses the remote bridge; switching back to local restores the Electron bridge) — covered by tests at the session-service level.

## see also
- `design\feature_descriptions\B_017_project_workspace_domain_logic.md`
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
