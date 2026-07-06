---
id: B-016
title: config service initialized during component render
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`ensureConfigServiceInitialized()` is called in the render body of `ProjectWorkspace` and `ConfigPage`. That is a side effect during render, against the documented two-phase service lifecycle ("Config-dependent work runs in init()/start()/app bootstrap"), and fragile under React StrictMode double-rendering and future concurrent rendering.

## Fix
- Initialize `configService` exactly once in app bootstrap: `useAppBootstrap` already calls `configService.init(...)` — make that unconditional and early (before any component that might read config renders), including the no-last-project path.
- Delete both `ensureConfigServiceInitialized` helpers; components assume an initialized service and fail loudly otherwise (the service already throws).
- `ConfigPage`'s `useState(() => configService.loadDraft())` initializer also mutates service state during render — move draft loading into a `useEffect` (or an explicit open handler) with state set afterwards.

## acceptance criteria
- No component calls `configService.init` or `loadDraft` during render.
- The app boots correctly with and without a restorable project, in web and Electron modes.
- StrictMode double-invocation causes no duplicate init or draft churn.
- Existing config tests still pass; a test asserts init happens once during bootstrap.

## see also
- `design\architecture\architectural_decisions.md`
- `design\feature_descriptions\F_016_config.md`
