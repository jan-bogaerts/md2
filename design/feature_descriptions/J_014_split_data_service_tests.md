---
id: J-014
title: split the monolithic data service test file
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`app/src/data/data.test.ts` is a 1,600+ line monolith that predates the J-005 split: it exercises card operations, project loading, agent integration, releases, commit batching and error paths through one shared harness against the `DataService` facade. Finding the tests for a given collaborator means scanning the whole file; adding a test means understanding the whole harness; and the file's location (`src/data/`) no longer matches the code under test (`src/services/`).

## Fix
- Extract the shared fixtures (fake storage service, sample files/cards, helpers) into `app/src/services/test_support/` (or a `data_test_helpers.ts`).
- Split along the collaborator seams introduced by J-005, colocated with the code: `card_operations.test.ts`, `project_loading.test.ts` (merge with existing coverage), `agent_integration.test.ts`, `release_operations.test.ts`, plus a slim `data_service.test.ts` for facade wiring/events only.
- Pure mechanical move: keep assertions identical; delete `data.test.ts` when empty.
- Coordinate with J-011 — if the context narrowing lands first, tests target the collaborators directly instead of always going through the facade.

## acceptance criteria
- `data.test.ts` is gone; each collaborator has its own colocated test file sharing common fixtures.
- Test count and coverage do not decrease; suite stays green.
- No test file exceeds ~500 lines.

## see also
- `design\feature_descriptions\ready\J_005_split_data_service_collaborators.md`
- `design\feature_descriptions\J_011_narrow_data_service_context.md`
