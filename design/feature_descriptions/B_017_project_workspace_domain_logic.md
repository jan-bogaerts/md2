---
id: B-017
title: ProjectWorkspace owns domain workflows (god component)
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`app/src/components/project_workspace.tsx` (~320 lines) owns project open/create orchestration (`createStorageService` + `dataService.init` + `openProject`), session persistence (`writeLastProject`), branch switching, push-mode config writes, card creation and navigation state. The architecture decisions say components do not own domain state/logic — this belongs in services, with the component reduced to presentation + hooks.

## Fix
- Add a `projectSessionService` (singleton, `src/services/`) owning: open GitHub/local project, create project, switch branch, persist/restore last session, push. It wraps the existing `dataService`/storage wiring currently inlined in the component.
- `ProjectWorkspace` consumes it through a hook (`useProjectSession`) exposing status/error, and keeps only UI state (view mode, selection, drafts).
- Navigation state (`requestedPath`/nonce) can move into the existing `workspaceNavigationService` so card→file jumps don't thread through props.
- This refactor is a prerequisite-friendly companion to F-027 (selection UI) and B-019 (form placement) — do it first or together.

## acceptance criteria
- No component calls `createStorageService`, `dataService.init` or `writeLastProject` directly.
- `ProjectWorkspace` shrinks to view composition + handlers delegating to services.
- Behavior is unchanged (open, restore, switch branch, push, create card) and covered by service-level tests instead of only component tests.

## see also
- `design\architecture\architectural_decisions.md`
- `design\feature_descriptions\F_027_repository_branch_selection.md`
