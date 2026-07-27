---
id: J-005
title: split data service into scoped collaborators behind the facade
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 08c2a65f-83b0-4d55-8f82-e8990db2fe32
---

## Goal
Item 2 of J-002. `data_service.ts` is ~1,070 lines. Keep `DataService` as the single public facade (components/hooks keep calling it), but move the implementation into collaborator classes it instantiates — per `data management.md`: "divided in subservices, depending on scope". Pure refactor — **no behavior change**, public API unchanged.

Depends on: J-003 (dead alias files deleted, module back at `app/src/services/data_service.ts`).

## implementation details
- `services/project_loading.ts` — open/create project, phased root+background load, load tokens, snapshot creation, watch start/stop and watch-event routing.
- `services/card_operations.ts` — saveFile/updateCardBody/affects/header/title/policy, moveCard + ordering repair, deleteCard/deleteFile, createCard.
- `services/agent_integration.ts` — conversation resolution/attachment maps, start/continue/sendInput, run-event handling, onState trigger dispatch and error recording.
- `services/release_operations.ts` — completeRelease (`release_archiving` stays in `data/`).
- do not wrap every function in `data_services.ts` to the actual implementation, but use the subservices, preferably as properties. Update call-sites to the new properties or services
- Remarkable import orchestration already lives mostly in `remarkable_import_service.ts`; move the remaining `importRemarkableImages`/metadata glue there.
- The commit batcher, `currentFiles`/snapshot state and `dispatchChanged` stay in the facade; collaborators receive a **narrow state accessor** (interface with just the members they need), not the whole service.
- One collaborator extraction per commit; each commit must actually **move** the code out of the facade — a collaborator that duplicates or re-exports facade logic is a failure (this is exactly how the first attempt went wrong).
- Run `npm run typecheck` and the app test suite after each commit.

## acceptance criteria
- `data_service.ts` is under 250 lines of delegation + shared state.
- The four collaborator modules exist, are instantiated by the facade, and contain the moved logic — no duplicate implementation remains in the facade.
- `DataService`'s public API is unchanged; existing tests pass unmodified except for import paths.
- `npm run typecheck`, lint and the app test suite pass after every commit.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\architecture\initial description\data management.md`
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
