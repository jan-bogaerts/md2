---
id: F-2
title: ProjectWorkspace owns domain workflows (god component)
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 96d2a0da-baf3-4686-b907-9542e58753b9
after: ac0b585c-0f35-4d48-be98-a229e98d92ae
---

## Problem
**Updated 2026-07-07:** largely resolved. `projectSessionService` (`app/src/services/project_session_service.ts`) now owns open/create/switch-branch/push/session persistence, `ProjectToolbarMenu` consumes it via `useProjectSession`, and no component calls `createStorageService`/`dataService.init`/`writeLastProject` outside tests. **One residue remains:** the startup restore path in `use_app_bootstrap.ts` still inlines `createStorageService` + `dataService.init` instead of delegating to `projectSessionService`, so "restore last session" has two implementations. Remaining scope: route bootstrap restore through the service (see also [[B-042]] for the related `createStorageService` side-effect cleanup), then move this card to ready.

Original problem, for history:

**Updated 2026-07-06:** the god component moved instead of dissolving. `ProjectWorkspace` was slimmed to view composition, but the domain orchestration now lives in `app/src/components/shell/project_toolbar_menu.tsx` (~736 lines, 22 direct data-service/storage call sites): project open/create for GitHub/local/remote (`createStorageService` + `dataService.init` + `openProject`), session persistence (`writeLastProject`), branch listing/switching, working-folder chooser flow, push, complete-release and the new-card form. The architecture decisions say components do not own domain state/logic — this belongs in services, with components reduced to presentation + hooks. No `projectSessionService` exists yet.

## Fix
See `design\feature_descriptions\J_002_refactor_large_modules.md` item 1 for the concrete split (service + `useProjectSession` hook + dialog subcomponents). In summary:
- Add a `projectSessionService` (singleton, `src/services/`) owning: open GitHub/local/remote project, create project, switch branch, working-folder resolution, persist/restore last session, push, complete release. It wraps the existing `dataService`/storage wiring currently inlined in `ProjectToolbarMenu`.
- `ProjectToolbarMenu` consumes it through a hook (`useProjectSession`) exposing status/error, and keeps only menu/dialog UI state; the dialogs (open project, working-folder chooser, new card, complete release) become sibling components.
- Navigation state (`requestedPath`/nonce) can move into the existing `workspaceNavigationService` so card→file jumps don't thread through props.

## acceptance criteria
- No component calls `createStorageService`, `dataService.init` or `writeLastProject` directly.
- `ProjectToolbarMenu` shrinks to menu composition + dialog triggers delegating to services.
- Behavior is unchanged (open, restore, switch branch, push, create card, complete release) and covered by service-level tests instead of only component tests.

## see also
- `design\architecture\architectural_decisions.md`
- `design\feature_descriptions\J_002_refactor_large_modules.md`
- `design\feature_descriptions\F_027_repository_branch_selection.md`
