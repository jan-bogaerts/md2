---
author: 
id: B_305
internalId: 844f1b00-159f-43e2-a2d1-2c6cb40ec39b
title: Error: ENOENT: no such file or directory, open 'C:
status: ready
owner: 
affects:
agents:
  - design/activity/card__844f1b00-159f-43e2-a2d1-2c6cb40ec39b.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153402939
sentryOrganization: elastetic
branch: b_305_error_enoent_no_such_file_or_directory_open_c
worktree: 2
changedFiles:
  - app/src/components/text_view/card_editor.real.test.tsx
  - app/src/services/data/data_service.ts
  - app/src/services/project/expected_persistence_storage.service.test.ts
  - desktop/src/shell/local_bridge_dispatch.js
---
## Sentry issue

**Title:** Error: ENOENT: no such file or directory, open 'C:\Users\janbo\Documents\dev\md2\design\feature\_descriptions\F\_429\_no\_commit\_batch\_after\_conversation\_view\_changed.md'

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153402939/)

**First seen:** 2026-10-13T15:36:14Z

**Last seen:** 2026-10-15T07:47:54Z

**Occurrences:** 3

**Release:** Not provided

**Environment:** production

**Culprit:** lre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js)

**Event ID:** ded0f6b2395c41708afb08266e49e9d8

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:63602` — async Xre.prepare
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:724:44403` — async OLe
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2548` — dre
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2416` — qm
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2268` — lre



This is happening because of a recent change we did for improving the speed: we no longer blindly commit everything on the commit-batcher when opening an action popup. This causes a problem though when creating new md files. it seems that the commit-batcher both saves and commits the files. This is ok, we don't need to commit when opening an action popup. however, we should flush all local changes to disk, so save files locally, otherwise the desktop can't use the data.

## Current state

**Prompt preparation.** Opening an agent action popup calls `defaultPreparePrompt` (`app/src/components/actions/run/popup/action_popup_defaults.ts`). Before J_60 (commit `24fc9f63c`, 2026-10-09) it called `projectPersistenceService.flushPendingChanges()`, which wrote, committed and pushed everything. Now it only calls `actionService.draftStore.flushDrafts()`, which moves action drafts into the commit batcher, and then calls `bridge.prepareActionPrompt`.

**Desktop reads from disk.** `ActionRunnerService.prepareActionPrompt` (`desktop/src/actions/action/action_runner_service.js`) loads the root action file and then calls `appendCurrentCardReferences` (`action_card_references.js`). That function reads the context card through `localGitService.loadFile(project, context.file)`.

**Commit batcher.** `CommitBatcher` (`app/src/data/commit_batcher.ts`) holds pending card, file, action and diagram changes in memory. It sends them to storage only in `flush()`, which runs on a timer or through `flushPendingChanges`. `flush()` calls `storage.commit`. On the desktop, `commitNow` (`desktop/src/project/project_files.js`) writes the files and moves, stages them with `git add` and commits them in one step. There is no call that only writes files.

**Cause of the ENOENT error.** `createCard` (`card_operations.ts`) adds the new card to memory and queues it in the batcher. The file exists only in memory until the timed commit runs. If the action popup opens on that card before the commit, `loadFile` fails with ENOENT. Changes to existing files show the same gap without an error: the desktop reads stale content. This affects card fields such as `references`, card bodies and edited action definitions.

**Editor text outside the batcher.** Typing in a Markdown editor updates only the open document's draft. `MarkdownEditor.flush()` moves that text into the batcher through `dataSource.commit`, then `cards.updateCardBody`, then `commitBatcher.schedule`. For card editors, `flush()` runs only on a document switch, an unmount or a project-level flush:
- The list card editor (`text_view/card_editor.tsx`, binding `list-card`) and the board popup editor (`card_view/card_body_editor.tsx`, binding `board-card`) do not set `flushOnBlur`. Leaving them does not flush.
- The list editor's **Agents** button (`text_view/list_editor_toolbar_controls.tsx`) is inside the editor's blur container, so even with `flushOnBlur` clicking it would not flush. `handleBlur` ignores focus moves inside the container.

## Implementation details

**1. Flush card editors on blur**
- `CardEditor` and `CardBodyEditor` pass `flushOnBlur` to `MarkdownEditor`.

**2. Flush the list editor when Agents is clicked**
- `CardEditor` keeps a `MarkdownEditorHandle` ref on its `MarkdownEditor`. It passes a flush callback to `ListEditorToolbarControls` through its `toolbarContents` callback.
- `handleToggleAgentPopup` calls that flush before `cardPopupService.toggleAction`. If the flush fails, `dataSource.commit` already reports the error through `dialogService`, and the popup still toggles.

**3. Write-only storage call**
- `StorageService` (`app/src/data/data_types.ts`) gets an optional `writeFiles(request: WriteFilesRequest): Promise<void>`. `WriteFilesRequest` is `{ branch, files, moves? }`, the same shape as `CommitRequest` without `message`.
- `LocalGitStorageService` forwards the call to the Electron bridge. `ElectronDataBridge` gets `writeFiles`, `preload.js` adds it to `DATA_METHODS`, and `local_bridge_dispatch.js` adds `writeFiles: (request) => localGitService.writeFiles(request, currentLocalProject)`.
- `project_files.js` adds `writeFiles(request, project)`, run inside `holdProjectMutation`:
  - for each move: create the target folder, `fs.promises.rename` the source if it exists, then write the target content;
  - for each file: create the folder, then write the content;
  - no git commands.
  
  A later `commitNow` stays correct. If a moved source is gone and was tracked, `commitNow` stages the deletion with `git add -u`. It then writes and stages the target again.
- GitHub and remote-control storage do not implement `writeFiles`. Prompt preparation already requires the Electron bridge.

**4. Track the write as an expected change**
- `withExpectedPersistenceOutcomes` (`expected_persistence_storage.ts`) wraps `writeFiles` with the same outcomes as `commit` (`commitOutcomes`). This prevents the project watcher from treating the write as an external change.
- `CardOperationContext` gets `writeTrackingPaths(request)`. It calls `storage.writeFiles` and then `recordCurrentContent` for the files and move targets, like `commitTrackingPaths` does. It throws a clear error when the storage has no `writeFiles`. `CardOperations.writeFiles` forwards to it, and the batcher calls it.

**5. `CommitBatcher.writePending()`**
- Shares one request builder with `commitActiveBatch`: serialize changes, split them into `files` and `moves`, and add `branch`.
- Does nothing when nothing is pending. Waits for an in-flight `flush()` first.
- Writes all pending changes through `writeFiles`. It leaves them pending, keeps the timer, and does not acknowledge save references, call `onPersisted`, call `onPathCommitted` or update the serialized-card baseline. The later timed commit stays the only place that marks changes as persisted.
- `flush()` waits for an in-flight `writePending()` before it takes the batch. This keeps an older write from landing on disk after a newer commit.
- On failure, the error propagates. The pending batch stays unchanged.
- `DataService.writePendingFiles()` exposes it.

**6. Prompt preparation**
- `defaultPreparePrompt`: after `flushDrafts`, call `await dataService.writePendingFiles()`, then `bridge.prepareActionPrompt`. It still does not call `flushPendingChanges` (no commit or push).

**Edge cases**
- New card that was never committed: written to disk, so no ENOENT.
- Card renamed while the move is pending: the target exists and the source is gone on disk, and the later commit stages both.
- Edits that arrive while a write is in flight stay pending and are committed by the timer.
- Failed write: the popup shows the prepare error, and nothing is lost from the batcher.
- The save indicator keeps showing pending changes until the timed commit, which is correct because nothing is committed yet.

## Acceptance criteria

- Creating a card and opening an agent action popup on it before the timed commit prepares the prompt without an ENOENT error.
- Opening the popup does not create a git commit. The queued changes are committed later by the normal timed commit.
- Body text typed in a board popup card or a list card, followed by opening an action popup (run button, list **Agents** button or project agent button), is on disk before prompt preparation.
- Card references added just before opening the popup appear in the prepared prompt's `Card references:` block.
- An action definition edited just before opening the popup is read from disk with its latest content.
- The project watcher does not report the write-only save as an external change.
- Tests:
  - `commit_batcher.test.ts`: `writePending` sends the pending files and moves without a message, keeps them pending, does not acknowledge them, and does not reset the timer. `flush` waits for an in-flight write.
  - `action_popup_defaults.node.test.ts`: the pending write happens after `flushDrafts` and before `prepareActionPrompt`, and `flushPendingChanges` is not called.
  - `project_files.test.mjs`: `writeFiles` writes files and moves without running git. A following `commit` stages and commits them.
  - `expected_persistence_storage` test: `writeFiles` registers outcomes the same way `commit` does.
  - `card_editor.test.tsx` and a `card_body_editor` test: leaving the editor schedules the body in the batcher.
  - `list_editor_toolbar_controls.test.tsx`: clicking **Agents** flushes the editor before the popup toggles.