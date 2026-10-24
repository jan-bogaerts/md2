---
author: 
id: B_306
internalId: c198a211-ff9a-41ec-b20d-5d300cac7035
title: Error: Primary worktree has uncommitted changes; c
status: ready
owner: 
affects:
agents:
  - design/activity/card__c198a211-ff9a-41ec-b20d-5d300cac7035.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153373637
sentryOrganization: elastetic
branch: b_306_error_primary_worktree_has_uncommitted_changes_c
worktree: 1
changedFiles:
  - app/src/components/hooks/use_primary_changes.ts
  - app/src/components/primary_change_list.tsx
  - app/src/components/primary_change_message_field.tsx
  - app/src/components/primary_change_row.tsx
  - app/src/components/primary_changes_confirm_button.tsx
  - app/src/components/primary_changes_dialog.test.tsx
  - app/src/components/primary_changes_dialog.tsx
  - app/src/components/worktree_selector.test.tsx
  - app/src/data/electron_data_bridge.ts
  - app/src/data/primary_change_types.ts
  - app/src/services/project/primary_changes_service.node.test.ts
  - app/src/services/project/primary_changes_service.ts
  - desktop/src/git/worktree_service.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.test.mjs
---
## Sentry issue

**Title:** Error: Primary worktree has uncommitted changes; commit or discard them and retry integration: design/actions/.md2-schedules.json, design/activity/card__26179cc3-97a2-4a33-9e4f-a3b7116e217c.json, design/activity/card__2ac96102-aba9-4901-a7f3-fcbd78b6b7fc.json,...

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153373637/)

**First seen:** 2026-10-13T13:41:03Z

**Last seen:** 2026-10-15T07:45:29Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** lre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js)

**Event ID:** 50b5f0ba071b419d9cb4092a289c400a

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:724:89548` — async we
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:10373` — async EventTarget.integrateCardWorktree
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:504:7743` — async Yge.track
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:504:8155` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:509:21914` — async mve.integrateWorktree
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2548` — dre
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2416` — qm
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2268` — lre

this occurs when we try to merge a worktree back into the main repository (integrate into project) and there are files in the repo that have not yet been staged.&#x20;

instead of showing an error, we should show a dialog that

* lists all the files
* user can delete files (trashcan behind each file, visible when mouse is over entry). deleted files are moved to the systems trash can.
* user can enter a commit text
* user can click ok or cancel. cancel stops the operation (including merge). ok stages the files and commits them, then the previous (merge) process can continue
* each entry shows whether the file is tracked by Git or not, using a color and a tooltip

## Current state

Terms used below:

* **Primary worktree**: the project root checkout (`project.rootPath`) on the project branch.
* **Dirty entry**: one line of `git status` in the primary worktree: an untracked file, or a tracked file with uncommitted edits or a deletion.

Integration flow today:

1. The renderer calls `worktreeService.integrateCardWorktree` (card) or `worktreeService.integrateProjectWorktree` (project action worktree) in `app/src/services/project/worktree_service.ts`. Both flush pending renderer saves first, then call `storage.integrateWorktree`.
2. The desktop bridge `integrateWorktree` (`desktop/src/shell/local_bridge_dispatch.js`) takes the project lock (`projectOperationCoordinator.run`), commits desktop writes recorded in `uncommittedProjectWrites`, then calls `WorktreeService.integrate` (`desktop/src/git/worktree_service.js`).
3. `integrate` calls `requireCleanPrimaryForIntegration`. It runs `git status --porcelain` and throws `Primary worktree has uncommitted changes; commit or discard them and retry integration: <paths>` when any dirty entry remains. This happens before the checkpoint commit and before any rebase, so the repository is unchanged.
4. The error travels back to `WorktreeSelector` (`app/src/components/worktree_selector.tsx`), which shows it through `dialogService.error`.

Which files still block integration after step 2: untracked files and tracked files edited outside md2 (external editor, scripts, agents running in the primary worktree). md2's own saves are already committed by steps 1 and 2.

Parsing limits of the current check: the porcelain output is trimmed by `runGit`, untracked folders are reported as one `folder/` entry, renames are reported as `old -> new`, and the entry does not say whether the file is tracked.

`requireCleanPrimaryForIntegration` has one call site (`integrate`). `continueConflict` and `rebase` do not call it.

## Implementation details

### Shared types (app)

New file `app/src/data/primary_change_types.ts`:

* `PrimaryChange`: `{ path: string, originalPath?: string, tracked: boolean, onDisk: boolean, kind: 'modified' | 'deleted' | 'added' | 'renamed' | 'untracked' }`. `originalPath` is set only for renames. `onDisk` is false for deleted tracked files.
* `DirtyPrimaryOutcome`: `{ changes: PrimaryChange[], status: 'dirtyPrimary' }`.
* `CancelledIntegrationOutcome`: `{ status: 'cancelled' }`.

`StorageService.integrateWorktree` returns `WorktreeOperationOutcome | DirtyPrimaryOutcome`. `WorktreeOperationOutcome` itself stays unchanged, so `mergeConflictService.continue` is not affected.

### Desktop: `WorktreeService` (`desktop/src/git/worktree_service.js`)

* Replace `requireCleanPrimaryForIntegration` with `readPrimaryChanges(project)`. It keeps the branch check, runs `git status --porcelain=v2 -z --untracked-files=all`, and parses entries into `PrimaryChange` objects:
  * `1 XY ... path` → tracked; `kind` from `XY` (`D` → `deleted`, `onDisk: false`; `A` → `added`; otherwise `modified`).
  * `2 XY ... path\0originalPath` → tracked, `kind: 'renamed'`, `originalPath` set.
  * `? path` → `tracked: false`, `kind: 'untracked'`.
  * Porcelain v2 lines start with a type character, so the trimmed `runGit` output does not corrupt the first entry.
* `integrate`: when `readPrimaryChanges` returns entries, return `{ changes, status: 'dirtyPrimary' }` instead of throwing. It still returns before the checkpoint commit and rebase.
* New `commitReviewedPrimaryChanges(project, paths, message)` via `enqueueScopedMutation([project.rootPath])`. The existing `commitPrimaryChanges` (checkpoint commit used by `rebase`) is not changed. The new method:
  * rejects an empty `message`;
  * re-reads `readPrimaryChanges` and rejects any requested path that is not a current entry (`Primary worktree changed; review the file list again`);
  * adds `originalPath` of renamed entries;
  * runs `git --literal-pathspecs add -A -- <paths>` and `git --literal-pathspecs commit --only -m <message> -- <paths>`, then `refreshAfterMutation`.
* New `trashPrimaryChange(project, path)` via `enqueueScopedMutation([project.rootPath])`:
  * re-reads `readPrimaryChanges`; rejects when `path` is not a current entry or the entry has `onDisk: false`. This stops a remote-control client from trashing arbitrary files;
  * calls the injected `trashItem(absolutePath)` dependency (Electron `shell.trashItem`, injected in the main process the same way `openProjectFolder` is);
  * calls `refreshAfterMutation` and returns the fresh `readPrimaryChanges` list. A trashed untracked file disappears from the list; a trashed tracked file comes back as `kind: 'deleted'`, `onDisk: false`.

### Desktop: bridge (`desktop/src/shell/local_bridge_dispatch.js`, `preload.js`)

* `integrateWorktree`: return the outcome directly when `integration.status === 'dirtyPrimary'`, same as the `conflict` branch (no finalize, no activity).
* New `commitPrimaryChanges({ message, paths, project })` and `trashPrimaryChange({ path, project })`, each inside `projectOperationCoordinator.run(project.rootPath, ...)`. Add both names to the preload method list.

### App: storage layer

Add `commitPrimaryChanges?(request)` and `trashPrimaryChange?(request): Promise<PrimaryChange[]>` to `StorageService` (`app/src/data/data_types.ts`), `electron_data_bridge.ts`, `local_git_storage_service.ts` and `remote_control_storage_service.ts`. `commitPrimaryChanges` adds the project branch to `pendingPushBranches`, like `integrateWorktree`. Add both names to `STORAGE_SAVE_METHODS` in `save_state_service.ts`. GitHub storage does not implement them; integration is local-only already.

### App: `PrimaryChangesService` (new, `app/src/services/project/primary_changes_service.ts`)

Owns the dialog state; extends `EventTarget`; registered through `service_injector` like `mergeConflictService`.

* Snapshot: `{ busy: boolean, changes: PrimaryChange[], message: string } | null`; `null` means no dialog. One `changed` event per snapshot change; the dialog is the only subscriber.
* `init({ storage })` / `clear()`; `clear()` resolves an open review with `false`.
* `review(project, changes): Promise<boolean>`: opens the snapshot with an empty message; resolves `true` after a successful commit (or when the list is empty on OK), `false` on cancel.
* `setMessage(message)`, `trash(path)` (replaces `changes` with the returned list), `confirm()` (calls `commitPrimaryChanges` with all listed paths and the message; skips the commit when the list is empty), `cancel()`.
* `trash` and `confirm` set `busy` during the call. On failure they report through `dialogService.error` and keep the dialog open.

### App: `worktreeService` (`app/src/services/project/worktree_service.ts`)

New private method `integrateWithPrimaryReview(project, request)`, used by `integrateCardWorktree` and `integrateProjectWorktree` in place of the direct `storage.integrateWorktree` call:

1. Call `storage.integrateWorktree(request)`.
2. When the status is not `dirtyPrimary`, return the outcome.
3. Otherwise `await primaryChangesService.review(project, outcome.changes)`. On `false`, return `{ status: 'cancelled' }`. On `true`, go back to step 1.
4. The loop is bounded by `MAX_PRIMARY_REVIEW_ROUNDS = 3`. After the last round still returns `dirtyPrimary`, throw `Primary worktree still has uncommitted changes after review`.

New files can appear between the commit and the retry (an agent writing in the primary worktree); the next round shows them. The card operation (`startCardOperation`) stays active while the dialog is open, so the card's worktree selector stays disabled.

`integrateCardWorktree` runs the activity queue and branch cleanup only for `completed` (unchanged). Return type becomes `WorktreeOperationOutcome | CancelledIntegrationOutcome`.

### App: callers in `WorktreeSelector`

* `handlePrimary` and `handleCommitIntegrateAndUnassign`: stop (no unassign, no error) when `outcome.status !== 'completed'`; this covers `conflict` and `cancelled`.
* `handleIntegration`: unchanged; it already closes the integration dialog after a non-throwing call.
* Project path (`handleIntegrateMenu`, `handleCommit`): unchanged; they ignore the outcome.
* A worktree commit made earlier in the same flow (linked worktree) stays committed on cancel; only the merge is stopped.

### App: `PrimaryChangesDialog` (new, `app/src/components/primary_changes_dialog.tsx`)

Mounted once in `app/src/app.tsx` next to `MergeConflictDialog`; subscribes to `primaryChangesService` with `useSyncExternalStore`.

* Title `Uncommitted project changes`; short text: the project branch has changes that must be committed before integration.
* List of entries, one row per `PrimaryChange`, showing the path (`originalPath → path` for renames).
* Tracked indicator per row: a state dot (style guide, 8px circle) with a `Tooltip`:
  * untracked → `info.main`, tooltip `Untracked: not yet in Git`;
  * tracked modified, added or renamed → `warning.main`, tooltip `Tracked: modified` / `Tracked: added` / `Tracked: renamed`;
  * tracked deleted → `error.main`, tooltip `Tracked: deleted`.
* Row-level trash `IconButton` (delete icon) for entries with `onDisk: true`, hidden at rest and shown on row `:hover`/`:focus-within` via opacity (style guide row actions), with `Tooltip` and `aria-label` `Move <path> to trash`.
* Commit message `TextField`, empty by default.
* Buttons bottom right: `Cancel`, `OK` (contained). `OK` is disabled while busy, or when the list is not empty and the message is blank. Escape/backdrop close equals `Cancel` when not busy.
* Event handlers are named constants (no inline handlers).

### Tests

* `desktop/src/git/worktree_service.test.mjs`: the test `refuses later primary changes without creating a checkpoint commit` now expects `{ status: 'dirtyPrimary', changes: [{ path: 'later.txt', tracked: false, ... }] }` instead of a rejection; the old expectation is stale because the error is intentionally replaced. Add tests for: modified tracked file, deleted tracked file, file inside a new folder (listed per file), `commitReviewedPrimaryChanges` commits only listed paths and rejects unknown paths, `trashPrimaryChange` rejects non-listed paths and returns the refreshed list (inject a fake `trashItem`).
* `local_bridge_dispatch.test.mjs`: `dirtyPrimary` returns without finalize/activity; new methods run inside the project lock.
* `worktree_service.node.test.ts` (app): `dirtyPrimary` → review → retry → `completed`; cancel → `cancelled` with no activity queue or unassign; bound reached → error.
* `primary_changes_service.node.test.ts`: confirm commits all paths with the message; empty list skips the commit; trash replaces the list; failures keep the dialog open.
* `primary_changes_dialog.test.tsx`: rows, tracked tooltips, trash button only for on-disk files, OK disabled with blank message, Cancel/OK call the service.
* `worktree_selector.test.tsx`: `cancelled` outcome does not unassign and shows no error.

## Acceptance criteria

1. Integrating a card worktree while the primary worktree has dirty entries shows the `Uncommitted project changes` dialog instead of an error, and the repository is unchanged while it is open.
2. Integrating the project action worktree under the same condition shows the same dialog.
3. The dialog lists every dirty entry per file, including files inside new folders, deleted tracked files and renames.
4. Each entry shows a colored dot with a tooltip stating whether it is untracked or tracked (and how it changed).
5. Hovering or focusing an entry that exists on disk shows a trash button; clicking it moves the file to the system trash and refreshes the list. Untracked files disappear; tracked files reappear as deleted.
6. `OK` is disabled while the commit message is blank, unless the list is empty.
7. `OK` commits exactly the listed files with the entered message on the project branch, then integration continues and completes (or opens the merge conflict dialog on conflict).
8. If new dirty entries appear before the retry, the dialog opens again with the new list; after 3 rounds integration stops with a clear error.
9. `Cancel` stops the integration: no commit, no merge, no activity entry, the card stays assigned to its worktree, and no error dialog is shown.
10. A failing commit or trash shows an error through `dialogService` and keeps the dialog open.
11. The desktop rejects commit or trash requests for paths not in the current dirty list.
12. The error `Primary worktree has uncommitted changes; commit or discard them and retry integration` is no longer thrown by `WorktreeService.integrate`.