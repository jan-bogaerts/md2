---
id: J-018
title: extract aggregate project persistence coordination from DataService
status: ready
owner: JB
affects:
  - app/src/services/data/data_service.ts
  - app/src/services/data/data_service.test.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/actions/action_service.ts
  - app/src/services/actions/electron_action_runner.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/project/project_session_service.ts
  - app/src/services/project/project_persistence_service.ts
  - app/src/services/project/project_persistence_service.test.ts
  - app/src/components/hooks/use_project_state.ts
  - app/src/components/hooks/use_project_state.test.ts
  - app/src/components/hooks/use_project_persistence.ts
  - app/src/components/hooks/use_project_persistence.test.ts
  - app/src/components/project_workspace.tsx
  - app/src/components/project_workspace.test.tsx
  - app/src/components/shell/main_window.tsx
  - app/src/components/shell/project_toolbar_menu.tsx
  - app/src/components/shell/menu/app_menu.tsx
policy:
  checkLinting: true
  requireTests: true
internalId: 4a1ef679-b831-463e-ac6c-537207708319
---

## Goal

Stop using `DataService` as both project/card state owner and aggregate persistence coordinator. A dedicated `ProjectPersistenceService` owns save state and flush ordering across card commits and action drafts. `DataService` no longer subscribes to `ActionService` or forwards every action change through its global `changed` event.

This is a prerequisite for [[J-017]]. J-017's open-document and Markdown data-source services must subscribe to the services that own card and action objects directly; they must not depend on action changes forwarded indirectly by `DataService`.

## Current architecture

`DataService` currently has two responsibilities:

- It owns the loaded project, files, derived card snapshot, storage adapter, and card `CommitBatcher`.
- It aggregates persistence state from `SaveStateService`, the card commit batch, storage pending-push state, and `ActionService` drafts.

The second responsibility creates a broad event bridge:

- The constructor subscribes to `ActionService` `changed` and calls `DataService.dispatchChanged`.
- `getState()` reads `actionService.hasPendingDrafts()` to compute `hasPendingSave` and `localSaveState`.
- `flushPendingChanges()` flushes action drafts and then the card commit batch.
- `useProjectState` exposes both project data and persistence state, so persistence-only events notify every project-state subscriber.

The action flush must precede the commit-batch flush: `ActionService.flushDrafts()` can schedule action files into the `CommitBatcher` through the existing persistence gateway. This ordering is correct and must remain unchanged.

## Target architecture

### `DataService`

`DataService` remains owner of project/card data and card persistence mechanics. It does not import, subscribe to, or query `ActionService` for aggregate state.

Its public state contains project data only:

```ts
export interface DataServiceState {
    project: ProjectReference | null
    runningAgents: AgentConversation[]
    snapshot: ProjectSnapshot | null
}
```

It exposes a separate, card/storage-specific persistence snapshot and event for the coordinator:

```ts
export interface DataPersistenceSnapshot {
    hasPendingCardCommit: boolean
    hasPendingPush: boolean
    isSaving: boolean
}
```

`persistenceChanged` is emitted only when this snapshot changes. Save-state and commit-batch transitions no longer dispatch the general `DataService` `changed` event unless project data also changed.

Card-specific operations keep current behavior:

- `CardOperations` continues to schedule and flush the existing `CommitBatcher`.
- Storage remains wrapped by `SaveStateService`.
- Action persistence continues to enter the same `CommitBatcher` through `DataService.persistActionFile`; this gateway does not make `DataService` owner of action draft state.

### `ProjectPersistenceService`

Add one global `ProjectPersistenceService`. It owns subscriptions, aggregate state, and cross-domain flush order.

```ts
export interface ProjectPersistenceSnapshot {
    hasPendingPush: boolean
    hasPendingSave: boolean
    localSaveState: LocalSaveState
}
```

It subscribes once to:

- `DataService` `persistenceChanged` for card/storage persistence facts;
- `ActionService` `changed` for action draft persistence facts.

It compares the next aggregate snapshot with the previous snapshot and emits its own `changed` event only when one of these three public values changes. Action editor-state changes that do not change persistence state produce no persistence event.

`flushPendingChanges()` preserves current ordering:

1. If action drafts are pending, await `ActionService.flushDrafts()`.
2. Await `CardOperations.flushPendingCommits()` so files scheduled by step 1 are included.
3. Propagate failures unchanged; do not mark state saved after a failed flush.

The service has an explicit, idempotent initialization method with injected dependencies. Its constructor only registers the singleton.

### React subscriptions

Add `useProjectPersistence`. It subscribes only to `ProjectPersistenceService` and returns `ProjectPersistenceSnapshot`.

Remove `hasPendingPush`, `hasPendingSave`, and `localSaveState` from `useProjectState`. Migrate consumers as follows:

- `ProjectWorkspace` lifecycle/quit checks use `projectPersistenceService` directly.
- `MainWindow`, `ProjectToolbarMenu`, and `AppMenu` use `useProjectPersistence` for save/push presentation.
- Components that need project or card data continue using `useProjectState`.

This separation prevents save-state-only and action-only events from re-rendering `ProjectWorkspace`, search, project menus that only need project data, or future Markdown editor owners.

### Project transitions and action execution

All aggregate flush call sites move from `dataService.flushPendingChanges()` to `projectPersistenceService.flushPendingChanges()`:

- browser visibility, blur, and unload handling;
- Electron flush handshake;
- project open, close, switch, reload, and storage-mode transitions;
- pre-action flush in `electron_action_runner`;
- menu and test helpers that explicitly flush all pending project changes.

`ProjectLoading` currently receives a `flushPendingCommits` callback from `DataService`. Replace it with an aggregate flush dependency resolved without creating a constructor cycle. Use the service injector at call time or inject the callback during initialization; do not import the coordinator back into `DataService` at module evaluation time.

## Call-site behavior

| Current call site | New owner | Required behavior |
| --- | --- | --- |
| `DataService.getState().hasPendingSave` | `ProjectPersistenceService.getSnapshot().hasPendingSave` | Same aggregate card + action meaning |
| `DataService.getState().localSaveState` | `ProjectPersistenceService.getSnapshot().localSaveState` | `saving` wins over `dirty`, then `saved` |
| `DataService.getState().hasPendingPush` | `ProjectPersistenceService.getSnapshot().hasPendingPush` | Same storage-backed meaning |
| `DataService.flushPendingChanges()` | `ProjectPersistenceService.flushPendingChanges()` | Flush actions first, then shared commit batch |
| `useProjectState` persistence fields | `useProjectPersistence` | Only persistence consumers re-render |
| `DataService` action `changed` listener | Direct coordinator subscription | No action event forwarding through DataService |

Do not add compatibility fields or forwarding methods to `DataService`: verified call sites all require the new aggregate owner and must migrate together.

## Failure modes and compatibility

- An invalid, conflicted, deleted, or failed action draft still makes `hasPendingSave` true and causes aggregate flush to reject as it does today.
- If action draft serialization schedules a file and card flush then fails, pending state remains dirty and the error reaches the existing caller/dialog path.
- Repeated initialization must not register duplicate listeners.
- Project switch/reset must publish the correct aggregate state after both domain services reset.
- Storage `isSaving` transitions must update persistence UI without dispatching project/card `changed`.
- Existing commit batching, pending-push semantics, Electron quit handshake, and action persistence gateway remain unchanged.

## Testing

- Unit-test aggregate state for every combination of saving, pending card batch, pending action draft, and pending push.
- Assert repeated equivalent dependency events produce no coordinator event.
- Assert one ActionService change causes one coordinator reconciliation and no DataService `changed` event.
- Assert action-only editor-state changes that do not alter pending persistence state produce no coordinator event.
- Assert flush order is action drafts first, card/shared commit batch second.
- Assert action files scheduled during draft flush are included in the same aggregate flush.
- Assert flush failures retain dirty state and propagate the original error.
- Update React hook tests to prove project-data and persistence subscriptions re-render independently.
- Update lifecycle, menu, project-session, project-loading, and action-runner tests to use the coordinator.

## Acceptance criteria

- `DataService` does not subscribe to `ActionService` and does not query action draft state.
- `DataServiceState` contains no aggregate persistence fields.
- Persistence-only transitions do not dispatch `DataService` `changed`.
- `ProjectPersistenceService` is the only owner of aggregate `hasPendingSave`, `localSaveState`, and cross-domain flush ordering.
- Every aggregate flush call site uses `ProjectPersistenceService`.
- Action drafts still flush before the shared commit batch.
- Status bar, push controls, browser close protection, Electron quit, project transitions, and pre-action flushing behave as before.
- J-017 can subscribe directly to card/project object renewal and `ActionService` without receiving duplicate action callbacks through `DataService`.

## See also

- [[J-017]] — requires this separation before adding open-document and Markdown data-source subscriptions
- [[J-005]] — split DataService collaborators while retaining the aggregate facade this feature narrows
- [[J-011]] — narrowed collaborator access to DataService state
