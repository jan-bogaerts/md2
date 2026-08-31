---
author: 
id: B_201
internalId: 279da862-4385-442f-9c26-10d3bdde07e5
title: expected persistence outcomes for watcher echoes
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__279da862-4385-442f-9c26-10d3bdde07e5.json
policy:
after: 49c227f7-c9c7-4773-a246-b4ec451244f1
changedFiles:
  - app/src/components/project_workspace.test.tsx
  - app/src/services/actions/action_service.node.test.ts
  - app/src/services/actions/action_service.ts
  - app/src/services/data/card_operation_context.ts
  - app/src/services/data/data_service.ts
  - app/src/services/data/project_file_operations.ts
  - app/src/services/project/expected_persistence_outcomes.test.ts
  - app/src/services/project/expected_persistence_outcomes.ts
  - app/src/services/project/expected_persistence_storage.test.ts
  - app/src/services/project/expected_persistence_storage.ts
  - app/src/services/project/project_loading.test.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/project/project_state.node.test.ts
  - app/src/services/project/project_state.ts
  - design/architecture/data_saving_and_commits.md
---
Watcher notifications from local persistence can arrive after the storage call finishes and be misclassified as external changes. This can reload stale content, create false conflicts, or undo in-memory path reconciliation.

## Current state

`ProjectState.commitPathsInFlight` is a set of paths. Persistence code adds affected paths immediately before a storage call and removes them in `finally` as soon as the returned promise settles. `ProjectLoading` treats watcher events for paths in that set as local echoes.

The desktop watcher independently settles filesystem activity for 75 ms. Its notifications can therefore arrive before, during, or after the storage promise. Filesystem watchers may also coalesce several writes, represent a rename as separate removal and addition events, or miss events while the watcher is interrupted. Storage-call lifetime is consequently not a reliable event-origin boundary.

This affects more than batched action saves. The same path set is used by ordinary commits, card-separator moves, external-card imports, Markdown reload suppression, and action reload classification. Local and remote-control storage both ultimately receive the same path-only `ProjectWatchEvent` shape.

The application already knows what each local operation intends to persist. `CommitRequest.files` describes expected file content, moves describe an absent source and a target with known content, and delete requests describe expected absence. Successful operations also reconcile application state directly. Watcher delivery is not required to complete a save and must not become such a requirement.

## Required behavior

* Replace storage-call-lifetime origin detection with expected persistence outcomes.
* An expected present outcome contains the normalized repository path and exact expected content. An expected absent outcome contains the normalized repository path.
* Register outcomes before starting the storage mutation, so notifications emitted during the mutation can be recognized.
* Keep the latest outcome for a path and defer classification while a newer local operation affecting that path is unresolved.
* After affected local operations settle, compare the path's actual persisted state with its latest expected outcome.
* A matching outcome is a local persistence echo. It may update repository-path bookkeeping, but it must not reload domain state or create a conflict.
* A non-matching outcome is an external change and follows the existing reload and conflict behavior.
* Consume a matching outcome only after the actual persisted state has been observed. Do not consume it merely because the storage promise resolved.
* Do not wait for a fixed number of watcher events. Local persistence must finish even if notifications are coalesced or never arrive.
* Do not expire outcomes solely by elapsed time. Project reset and verified full resynchronization clear obsolete outcomes. If retained state reaches a defined bound, trigger verification/resynchronization before removing it.
* A failed mutation retains enough outcome state to recognize filesystem effects that occurred before failure. Retry, discard, or verified resynchronization resolves that state.
* Consecutive writes and moves to the same path use the latest outcome after all affecting operations settle; delayed events inspect current persisted state rather than assuming they describe the first operation.
* Local Electron and remote-control projects use the same renderer-side classification behavior. GitHub projects without a watcher remain unaffected.

## Implementation details

1. Add a project-scoped expected-outcome owner with explicit lifecycle and bounded retained state. It stores path outcomes and unresolved operations; it does not implement a listener registry or revision-counter subscription mechanism.
2. Derive outcomes centrally for storage operations that can produce project watcher events. Writes produce present outcomes, moves produce absent-source and present-target outcomes, file deletions produce absent outcomes, and folder deletions expand to the known repository paths under that folder.
3. Register an operation and its outcomes before invoking storage. Settle the operation in both success and failure paths without deleting unobserved outcomes.
4. Replace all verified `commitPathsInFlight` call sites. Ordinary batched commits, card-separator migration, and external-card import must use the same outcome API. Do not add compatibility flags for the old set behavior.
5. Keep watcher callbacks path-based and granular. Queue an event while its path has an unresolved local operation. Once settled, load or stat the current path using the existing action-folder, Markdown-file, and repository-list loading paths.
6. Match present outcomes using exact content, not only existence or watcher `changeKind`. Match absent outcomes only when the path is actually absent. Treat `unknown` notifications the same way after inspecting storage.
7. For a matching action outcome, update repository-file bookkeeping but skip `ActionService.reloadFromFiles`; `ActionService` and the commit callback already publish and reconcile the local action by `ActionDefinition.id`.
8. For a matching Markdown outcome, skip the reload/conflict path. Keep `ProjectState` content and open-document state from the direct local persistence flow.
9. For a mismatch, remove the contradicted expectation and run the existing external action or Markdown reload path. Dirty drafts and open documents retain their current conflict protection.
10. On watcher restoration, use the existing full project resynchronization to compare retained outcomes with repository state before clearing them. Reset all outcome state when the project or branch scope is replaced.
11. Remove `ProjectState.commitPathsInFlight` and its dependency plumbing after every call site uses expected outcomes.
12. Update `design/architecture/data_saving_and_commits.md` to state that local writes reconcile directly and watcher origin is determined from observed persistence outcomes, not timing.

## Edge cases

* A rename may emit removal, addition, change, or one coalesced notification; classification uses source absence and target content.
* A newly created action renamed before its first write has an absent source and one expected final target.
* Several commits may affect the same path before one watcher notification. Classification waits for the unresolved operations and compares against the latest outcome.
* A commit may write files and then fail during Git commit or push. Matching filesystem effects remain local, while the existing save or push failure remains visible for retry.
* An external process may modify a path during local persistence. Content or existence that contradicts the expected outcome remains external and must not be suppressed.
* Watcher disconnect and restoration may lose notifications. Full resynchronization resolves retained outcomes without inventing events.
* Project and branch changes must not carry outcomes into the next project scope.

## Acceptance criteria

* A watcher notification arriving after `storage.commit` resolves is still recognized as a local echo when persisted state matches the expected outcome.
* Action creation and label-driven renames do not reload stale definitions or produce conflicts when removal and addition notifications arrive late, separately, or coalesced.
* Repeated action renames during sequential commits leave one latest definition at one path and do not depend on watcher event count or order.
* Matching Markdown write notifications do not overwrite local state or report false conflicts after the storage promise settles.
* A watcher event whose actual content differs from the expected local content follows existing external-change conflict behavior.
* Missing watcher notifications do not block save completion, explicit flush, project switching, or window close.
* Failed or partially applied storage operations remain retryable and do not cause their own filesystem effects to be reported as external edits.
* Card-separator migration and external-card import no longer manipulate `commitPathsInFlight` directly.
* Watcher restoration and project reset clear only outcomes resolved by verification or discarded with the old project scope.
* Local and remote-control watcher behavior is equivalent.
* Focused tests cover late events, events during persistence, missing and coalesced events, sequential outcomes for one path, rename source/target events, mismatches, failure and retry, watcher restoration, and project-scope reset.

## Out of scope

* Changing the desktop watcher's 75 ms settling delay.
* Requiring one watcher event for every local filesystem mutation.
* Using watcher delivery to acknowledge saves or advance action draft revisions.
* Changing automatic-commit delay, batching, push policy, or external-conflict presentation.
* Adding causal IDs to the desktop or remote-control watcher protocol unless implementation proves outcome matching cannot meet these requirements.
