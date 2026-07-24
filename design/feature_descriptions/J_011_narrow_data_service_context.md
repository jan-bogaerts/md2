---
id: J-011
title: narrow the DataServiceContext shared-state surface
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The J-005 split moved `DataService` logic into collaborators (`CardOperations`, `AgentIntegration`, `ProjectLoading`, `ReleaseOperations`) but connected them through `DataServiceContext` (`app/src/services/data_service_context.ts`, built in `DataService.createContext`) — a ~20-member bag of getters and setters over *all* of `DataService`'s private state (`setCurrentFiles`, `setCurrentSnapshot`, `setCurrentProject`, load-token counters, conversation maps…). Every collaborator can read and mutate everything, so the split is structural, not a real decoupling: invariants (e.g. "snapshot always derives from currentFiles") are maintained by convention across five files, and reasoning about who mutates what requires reading all of them. The DataService facade itself has drifted into a pure middleman with ~30 one-line delegating methods.

## Fix
Incremental narrowing, no behavior change:
1. **Introduce a state owner**: extract a `ProjectState` class owning `currentFiles`, `currentProject`, `currentSnapshot`, `inFlightCommitPaths` and the load tokens, with intention-revealing methods (`replaceFiles`, `mergeCommittedFiles`, `beginProjectLoad(): token`, `isCurrentLoad(token)`) instead of raw get/set pairs. Snapshot recomputation lives here so files/snapshot can't diverge.
2. **Split the context per consumer**: define narrow interfaces (`CardOperationsDeps`, `ProjectLoadingDeps`, …) listing only what each collaborator uses; `DataService` implements them from `ProjectState` + services. Delete the monolithic `DataServiceContext` once all four collaborators consume their own interface.
3. **Trim the facade**: where a caller only needs one collaborator (e.g. workspace uses `dataService.cards.updateCardBody`), expose the collaborator and drop the delegating one-liners; keep facade methods only where they add coordination.
4. Update `data.test.ts` incrementally (test split tracked as [[J-014]]) — behavior assertions stay identical.

## acceptance criteria
- No collaborator can mutate state it does not own (interfaces are minimal; grep shows no `setCurrentSnapshot`-style raw setters outside the state owner).
- `DataService` public behavior and events are unchanged; both test suites stay green.
- The delegating-method count on `DataService` drops substantially (target: coordination-only methods remain).

## see also
- `design\feature_descriptions\ready\J_005_split_data_service_collaborators.md`
- `design\architecture\architectural_decisions.md`
