---
id: B-030
title: remote storage impersonates the electron bridge via window global assignment
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: f9eb9e3d-d36b-40f0-a93f-340c8fffea53
---

## Problem
`createStorageService` in `app/src/data/project_session.ts` does `window.md2Actions = storage` when the storage type is `remote`, so every consumer that resolves the action/agent bridge through `getElectronActionBridge()` transparently finds the remote implementation. App code mutating a window global that is otherwise owned by the Electron preload is fragile:

- the TypeScript declaration for `window.md2Actions` describes the preload bridge, so the assignment relies on structural overlap rather than an owned contract;
- the assignment is never undone — after switching from a remote project back to GitHub or local mode, the stale remote bridge keeps answering `getElectronActionBridge()` calls;
- inside Electron, assigning over the contextBridge-exposed global shadows the real bridge for the rest of the session;
- detection-by-global makes tests set/unset window properties instead of injecting a dependency.

## Fix
- Add an explicit provider to `app/src/data/electron_action_bridge.ts`: `setActionBridgeOverride(bridge | null)`; `getElectronActionBridge()` returns the override when set, otherwise `window.md2Actions` from preload.
- `createStorageService('remote', …)` registers the remote storage through the override; creating any other storage type (and closing/switching the session) clears it.
- Remove the `window.md2Actions = storage` assignment and the widened typing it needs; no app code writes to `window` globals.

## acceptance criteria
- Remote mode still routes action/agent/schedule calls through the WebSocket storage service.
- Opening a GitHub or local project after a remote session clears the override; `getElectronActionBridge()` again returns the preload bridge (Electron) or null (web).
- No production code assigns to `window.md2*` properties (grep-verifiable).
- Tests cover override resolution order and clearing on storage-type switch.

## see also
- `design\feature_descriptions\F_032_remote_control_bridge.md`
