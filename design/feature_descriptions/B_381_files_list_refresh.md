---
author: 
id: B_381
internalId: d09dffff-8eaf-40b4-a7b4-2a25c28f9923
title: files list refresh
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__d09dffff-8eaf-40b4-a7b4-2a25c28f9923.json
policy:
branch: b_381_files_list_refresh
worktree: 2
---

we already have a file watcher in the desktop which monitors file changes in the repository.

In the react app, we also have a list of all the files in the repository for auto completes in the markdown editor (triggered by the 'at' symbol.

The problem is, after changes in the folders, the files-list is not updated.

This update shouldn't happen for every change, but filechanges (adding, moving, deleting) should trigger a request to update the list, with a timeout, so we don't continuously reload the list

## Current state

`desktop/src/project/project_files.js` watches the repository, ignores `.git`, settles repeated native events per path, and forwards changes only for Markdown, JSON, and text files. Existing paths are reported as `changed`; missing paths are reported as `removed`.

`ProjectLoading` loads the complete repository path list through `StorageService.listRepositoryFiles` during the background project load. `ProjectState` stores that list in `ProjectSnapshot.repositoryFiles`. `MarkdownEditor` reads the snapshot through `useProjectState` and gives the list to the `@` file-search plugin.

Watcher handling updates `ProjectSnapshot.repositoryFiles` one path at a time and publishes `repositoryChanged`, but it does not publish the project-wide `changed` event consumed by `useProjectState`. Mounted editors therefore keep their previous file-search list. Changes involving other file extensions or folders are not forwarded by the desktop watcher, so the renderer cannot repair the list from those events.

## Implementation details

* In `desktop/src/project/project_files.js`, continue ignoring `.git`. Forward create and delete events for every repository path so structural changes involving any file extension or folder reach the renderer. Continue filtering content-only update events to Markdown, JSON, and text files. Keep the existing per-path settle timer for duplicate native events.
* Keep `ProjectWatchEvent` and the preload, local, and remote-control bridge contracts unchanged. A path is structurally changed when it is reported as removed or when it is absent from the repository list held before the event. This also handles a move, which the watcher reports as removal of the old path plus creation of the new path.
* Add a repository-list refresh timer to `ProjectLoading`. Each structural event cancels and restarts the timer. After 250 ms without another structural event, call `storage.listRepositoryFiles` once for the active project. This reset-on-change delay is the debounce period.
* Do not reload the repository list for a content-only change to a path already present in the list. Continue publishing granular `repositoryChanged` events so existing file-specific reloads still run.
* On a successful request, exclude agent instruction paths using the same rule as project loading, replace `ProjectSnapshot.repositoryFiles` with the returned sorted list through `ProjectState`, and publish `changed` only when the list differs. Mounted editors then receive the new snapshot and rebuild their file-search options.
* Clear the pending timer when project loading resets, fails, stops, or switches project. Associate each request with the project reference, project-load token, and refresh revision that started it. Ignore a result when the project changed or a newer refresh superseded it.
* If listing fails, keep the previous repository list, report the failure through the existing optional-project-load warning path, and allow a later structural event to retry.
* Add focused tests in `desktop/src/project/project_files.test.mjs`, `app/src/services/project/project_loading.test.ts`, and `app/src/services/project/project_state.node.test.ts`. Cover non-text structural events, 250 ms batching, no refresh for known-path content changes, add/remove/move bursts, stale results, project switches, failures, and snapshot replacement. Existing Markdown editor file-search tests continue to verify that a new snapshot reaches the plugin.

## Acceptance criteria

* Adding, moving, or deleting a repository file of any extension causes the active repository file list to be requested after 250 ms without another structural event.
* Adding, moving, or deleting a folder causes the same refresh, so all contained repository paths are reflected.
* Multiple structural events within one 250 ms window produce one `listRepositoryFiles` request after the last event.
* Editing contents of a file already present in the repository list does not request a repository-list refresh.
* Successful refresh replaces the list atomically; `@` file autocomplete in an already mounted Markdown editor shows added and moved paths and stops showing deleted paths without reopening the project or editor.
* Agent instruction paths remain excluded from autocomplete after refresh, matching initial project loading.
* A refresh result from an old project or an older refresh request never changes the active project snapshot.
* A failed refresh leaves the previous list usable, reports a warning, and does not stop later structural events from scheduling another refresh.
* Existing Markdown, JSON, action, schedule, and agent-instruction watcher behavior remains unchanged.
