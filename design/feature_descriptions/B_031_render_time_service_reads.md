---
id: B-031
title: components read mutable service state during render instead of subscribing
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
B-016 removed service *initialization* from render, but reading mutable service state during render remains in several components:

- `ProjectWorkspace` (`app/src/components/project_workspace.tsx`) calls `dataService.getConfig()` in the render body and keeps a `configRevision` counter — incremented from a `configService` `changed` listener and consumed as `void configRevision` — purely to force a re-render so the next render re-reads the service. This is a hand-rolled, easy-to-break substitute for a subscription.
- `AppMenu` (`app/src/components/shell/menu/app_menu.tsx`) calls `dataService.getConfig()` in render and seeds `useState` from `configService.get('desktop.agent'/'desktop.model')`, so a config change made elsewhere (config page save, another menu instance) does not refresh the menu until remount.
- `ActionPopup` reads `configService` in `useState` initializers with an `isInitialized()` escape hatch (`readDefaultAgentSelection`), same staleness pattern.

Under React StrictMode/concurrent rendering these reads are tolerated only because the services never notify mid-render; the pattern invites tearing and stale UI.

## Fix
- Add hooks in `app/src/components/hooks/`:
  - `useProjectConfig()` — `useSyncExternalStore` over `dataService` `changed` events returning `dataService.getConfig()`;
  - `useConfigValue(key)` (or `useConfigValues(keys)`) — `useSyncExternalStore` over `configService` `changed` events.
- Replace the direct render-body reads in `ProjectWorkspace`, `AppMenu` and `ActionPopup` with these hooks; delete the `configRevision` counter and its listener effect.
- `AppMenu` derives selected agent/model from the hook values; local `useState` remains only for in-flight edits that have not been written to the service yet.

## acceptance criteria
- Saving a config change on `/config` immediately updates the app menu's agent/model selection and any open action popup defaults without remounting.
- `ProjectWorkspace` re-renders on project-config changes without the revision-counter hack (`void configRevision` is gone).
- No component calls `configService.get`/`dataService.getConfig` in a render body outside the shared hooks (grep-verifiable).
- Tests cover hook subscription behavior (value updates on service `changed`) and the menu refresh case.

## see also
- `design\feature_descriptions\B_016_config_init_during_render.md`
- `design\feature_descriptions\F_016_config.md`
