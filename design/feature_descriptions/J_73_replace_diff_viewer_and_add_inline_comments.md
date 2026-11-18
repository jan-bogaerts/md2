---
author:
id: J_73
internalId: f5778432-59ae-4f09-a254-7b450bf873a1
title: replace diff viewer and add inline comments
status: ready
type: job
owner:
affects:
agents:
  - design/activity/card__f5778432-59ae-4f09-a254-7b450bf873a1.json
policy:
changedFiles:
  - app/package-lock.json
  - app/package.json
  - app/src/app.tsx
  - app/src/components/actions/conversation/events/diff_comment_service.node.test.ts
  - app/src/components/actions/conversation/events/diff_comment_service.ts
  - app/src/components/actions/conversation/events/diff_comment_thread.test.tsx
  - app/src/components/actions/conversation/events/diff_comment_thread.tsx
  - app/src/components/actions/conversation/events/diff_file_view.tsx
  - app/src/components/actions/conversation/events/diff_line_mapping.ts
  - app/src/components/actions/conversation/events/diff_view.grouped.test.tsx
  - app/src/components/actions/conversation/events/diff_view.test.tsx
  - app/src/components/actions/conversation/events/diff_view.tsx
  - app/src/components/actions/conversation/events/diff_view_mode.test.tsx
  - app/src/components/actions/conversation/events/diff_view_mode_control.tsx
  - app/src/components/card_view/card_commit_diff_panel.test.tsx
  - app/src/components/card_view/card_commit_diff_panel.tsx
  - app/src/components/config/config_page.test.tsx
  - app/src/components/shell/main_window.test.tsx
  - app/src/data/electron_action_bridge.node.test.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/data/project_session.service.test.ts
  - app/src/services/actions/electron_action_runner.node.test.ts
  - app/src/services/config/config_entries.ts
  - app/src/services/config/config_persistence.service.test.ts
  - app/src/services/config/config_service.service.test.ts
  - app/src/services/config/config_service.ts
  - app/src/services/config/diff_view_config.node.test.ts
  - app/src/services/config/diff_view_config.ts
  - app/src/services/data/diff_service.node.test.ts
  - app/src/services/data/remote_control_desktop_config_transport.node.test.ts
  - app/src/services/project/merge_conflict_service.node.test.ts
  - app/src/services/project/project_session_service.service.test.ts
  - app/src/services/project/worktree_service.node.test.ts
  - app/src/services/search/search_regexp_agent.node.test.ts
  - design/feature_descriptions/F_473_tabbed_lazy_file_diff_workspace.md
  - desktop/package-lock.json
  - desktop/package.json
  - desktop/src/git/diff_service.js
  - desktop/src/git/diff_service.test.mjs
  - desktop/src/shell/config.js
  - desktop/src/shell/config.test.mjs
  - desktop/src/shell/local_bridge_dispatch.test.mjs
---

Replace `react-diff-viewer-continued` with `react-diff-view` for commit and worktree diffs. Preserve opening a changed line in the configured external editor and add session-scoped inline review comments through the new viewer's gutter events and widgets.

## Current state

`DiffView` renders every `DiffFile` with `react-diff-viewer-continued` in split mode. The desktop diff service reconstructs parallel `oldValue` and `newValue` strings from unified Git output and builds arrays that translate viewer-relative line IDs back to repository line numbers. `diff_line_mapping.ts` performs that translation before `openInEditor` is called.

The component has two verified consumers:

* `CommitReferenceRow` expands historical action-run commits.
* `CardCommitDiffPanel` renders a selected non-card file from a historical commit or the assigned worktree. The same panel still uses `DiffFile.oldValue` and `DiffFile.newValue` to render the card body through `MarkdownEditor`.

`react-diff-view` consumes unified patch text rather than two reconstructed strings. It provides split and unified rendering, real old/new line numbers, gutter events, and one widget host per change. The current bridge result does not retain the original patch, and worktree diffs are built from file contents rather than a unified patch.

There is no existing review-comment domain model, persistence format, remote method, or action-message contract. Inline comments in this job are therefore local review annotations owned by the renderer for the current application session. They are not GitHub comments, activity records, agent messages, or durable project data.

## Diff data contract

1. Add `patch: string` to `DiffResult` and `WorktreeDiffResult`. The patch is the canonical input to `react-diff-view`. Add `revision: string` to `WorktreeDiffResult`; it identifies only that generated result and must change whenever a new worktree diff is loaded.
2. For commit diffs, preserve the configured diff command and return its unified output as `patch`. Continue validating that the command produced parseable file diffs and continue returning the normalized file metadata needed by existing consumers.
3. Preserve the exact file headers and hunks from the command output. Do not rebuild a commit patch by comparing the reconstructed `oldValue` and `newValue`: those values contain only lines represented by the returned hunks and can lose unchanged gaps between hunks.
4. For worktree diffs, continue reading the base and worktree contents through the existing guarded paths. Add the `diff` package to `desktop/` and generate one unified patch per normalized file from those already loaded values. Use the old path for the old header and the current path for the new header so additions, deletions, and renames remain identifiable.
5. Bound worktree patch generation with the package's abort/complexity option. If a text patch cannot be generated within that bound, fail the diff request with a clear error rather than blocking the Electron main process indefinitely or returning a partial review.
6. Keep `DiffFile.oldValue`, `newValue`, `oldPath`, `path`, and `changeType`; `CardCommitDiffPanel` requires them for the card-body diff and renamed-file navigation.
7. Remove `oldLineNumbers` and `newLineNumbers` from `DiffFile` after all verified call sites move to the line numbers exposed by `react-diff-view`. Delete `diff_line_mapping.ts`; do not retain a compatibility mapping path that has no caller.
8. Update the local preload, remote-control bridge, and test fixtures only where the changed result shape requires it. Do not add a second diff method or legacy payload fallback.

## Viewer replacement

1. Replace the `react-diff-viewer-continued` dependency with `react-diff-view` and import its stylesheet once from the diff-view boundary.
2. Parse `result.patch` with `parseDiff` and render each parsed file using `Diff` and `Hunk` in split mode. Keep each file's old and new path visible and preserve the existing file order.
3. Keep `DiffView` responsible for loading, unavailable state, initial-file scrolling, repository-root validation, and composing file views. Move per-file rendering and comment widgets into focused components beside `diff_view.tsx` when needed; do not put the entire replacement into one component.
4. Use the parsed change object and side supplied by `react-diff-view` to resolve the real old or new line number. Clicking the line number continues opening that path and line in the configured editor. For a renamed file, the old side opens `oldPath` and the new side opens `path`.
5. Add a distinct comment affordance in the gutter. Clicking the comment icon opens the inline composer; clicking the line number opens the editor. Do not overload one click with both actions.
6. Render comments through one widget per changed line. The widget may contain several comments and one active composer because `react-diff-view` permits only one widget element for each change.
7. Keep unchanged ranges collapsed according to the hunks supplied by the patch. Do not synthesize the complete file or expand omitted context in this job.
8. Style the viewer and comment widgets with theme-backed values. Do not copy fixed GitHub colors into component code. Comment icon buttons require tooltips and accessible labels, and comment actions follow the existing MUI button and focus conventions.
9. Display a safe text fallback for binary files or file metadata changes that have no text hunks. The fallback identifies the file and change type without offering a line comment.

## Inline comment model and ownership

Add `DiffCommentService` beside the diff components in `app/src/components/actions/conversation/events/diff_comment_service.ts`. It is view state used only by this diff UI, so it does not belong in the shared data-service folder. The service owns comment and composer state; React components only subscribe and render.

Each comment has an application-generated `id` and the following immutable target:

* `revision`: the commit hash for historical diffs or a generated worktree-result identifier for one loaded worktree snapshot;
* `path`: the path on the selected side;
* `side`: `old` or `new`;
* `line`: the real file line number; and
* `lineContent`: the reviewed line captured when the comment is created.

The comment body is mutable. Paths locate the reviewed content but are not comment identity; `id` is the comment identity. A worktree result must include a generated `revision` value because a repository path or branch does not identify one immutable worktree snapshot.

The service must:

* extend or compose `EventTarget` and dispatch a granular event scoped to one revision, path, side, and line;
* expose stable snapshots for `useSyncExternalStore`;
* allow one active composer per target and multiple saved comments on that target;
* add, edit, and delete comments without mutating prior snapshots;
* reject empty or whitespace-only comments while preserving the entered draft and showing validation beside the composer;
* retain comments when a historical diff is collapsed and reopened during the same application session;
* clear all comment state when the active project session changes; and
* replace comments for a worktree revision when a newly loaded worktree result has a different revision.

Give the service a two-phase lifecycle. Its constructor creates no project-dependent state. Initialize it from the application bootstrap with access to the current `DataService` project snapshot and its `changed` event. Compare the canonical project reference fields, clear comment state only when the active project changes, and unsubscribe during application teardown. Do not use the repository root path as project identity.

Do not create comment state during React rendering and do not add a hand-written listener registry, revision counter, or whole-view refresh event. `DiffCommentThread` subscribes at the individual target rendered by its widget so editing one thread does not rerender every file.

## Affected call sites

* `CommitReferenceRow` keeps its independent show/hide behavior. Its commit hash is the comment revision, so reopening the same commit reconnects to the existing session comments.
* `CardCommitDiffPanel` keeps its card-body `MarkdownEditor` path and passes whole-file results to `DiffView` only for selected other files. Its worktree fixtures must include `patch` and `revision` after the bridge contract changes.
* `diff_service.ts` continues adapting a `CommitReference` to the existing `generateDiff` bridge request and attaching the known repository root to the result.
* `worktree_service.ts` continues selecting the assigned worktree and calling `generateWorktreeDiff`; it does not own comment state.
* `remote_control_action_bridge.ts` continues forwarding `generateDiff` and `generateWorktreeDiff` without reshaping their results.
* `app.tsx` initializes the comment service after the data service exists and provides the project-change subscription used to clear session comments.
* Tests and mocks in project-session, action-runner, worktree, search, and shell modules that construct empty diff results receive the required `patch` and worktree `revision` fields. Their behavior otherwise stays unchanged.

## Comment interaction

1. Hovering or focusing a commentable gutter exposes an Add comment icon without changing the gutter width.
2. Selecting Add comment opens an inline multiline field below that changed line and moves focus into it.
3. Save adds the comment and closes the composer. Cancel discards only the active draft. `Ctrl+Enter` submits; `Escape` cancels when the field is focused.
4. Saved comments render inline with Edit and Delete controls. Edit reuses the inline field. Delete acts immediately because comments are session-scoped and have no remote side effect.
5. Comment actions must stop propagation so they never open the external editor.
6. Deletion-only lines accept old-side comments; insertion-only lines accept new-side comments; paired/context rows use the side whose gutter affordance was selected.
7. Reloading the application discards comments. State that limitation in the empty composer helper text so users are not led to believe a review was published or saved.

## Failure modes and compatibility

* A malformed configured diff remains a load failure reported through `dialogService`; do not render a partially parsed patch.
* Patch parsing errors and worktree patch-generation errors use the existing unavailable state.
* A comment whose target is absent from a newly parsed patch is not rendered. Historical comments remain in the service only while their exact revision is retained; worktree comments are discarded with the replaced revision.
* Repository-root validation before opening an editor remains unchanged.
* Local Electron and remote-control mode must return the same result shape. The remote protocol method names and argument order remain unchanged.
* Existing card-body Markdown diff behavior remains unchanged and continues using the normalized worktree file values.
* Do not add React-version compatibility shims, duplicate viewer modes, or a feature flag for the retired viewer.

## Tests

* Update `desktop/src/git/diff_service.test.mjs` to cover preserved commit patches, multi-hunk files, added/deleted/renamed worktree patches, no-newline markers, generation bounds, and malformed or empty command output.
* Update diff-view tests to cover split rendering, old/new paths, initial-file scrolling, binary fallback, malformed patches, and opening the correct old or new path and real line.
* Add service tests for target identity, stable snapshots, granular events, multiple comments, editing, deletion, draft validation, project clearing, and worktree revision replacement.
* Add user-centric comment-thread tests for opening a composer, saving, cancelling, keyboard handling, editing, deletion, independent old/new targets, and preventing editor opening from comment actions.
* Update bridge and higher-level fixtures that construct `DiffResult`, `WorktreeDiffResult`, or `DiffFile`. Do not add tests that execute Git or another external process; keep the existing runner and filesystem boundaries mocked.
* Run focused app and desktop tests, app type checking, and both linters. Do not run the full test suites unless separately requested.

## Out of scope

* Publishing comments to GitHub, another forge, or a remote review service.
* Persisting comments in card Markdown, activity JSON, project configuration, browser storage, or a new sidecar file.
* Sending comments to an agent, appending them to an action prompt, or adding a submit-review workflow.
* Comment authors, timestamps, replies, resolution state, reactions, permissions, or synchronization between application instances.
* Editing repository content from the diff.
* Expanding omitted context or adding syntax-token workers.
* Replacing the card-body `MarkdownEditor` diff.

## Acceptance criteria

* `react-diff-viewer-continued` is removed and all whole-file commit and worktree diffs render through `react-diff-view`.
* Commit results retain the configured command's exact unified patch; worktree results contain a bounded, valid unified patch generated from their normalized old and new values.
* Split diffs preserve file order, old/new path labels, real line numbers, additions, deletions, modifications, renames, and a safe non-text fallback.
* Clicking an old or new line number opens the correct path and real line in the configured editor.
* Users can add, view, edit, and delete multiple session-scoped comments on commentable old and new lines.
* Comment widgets are accessible, theme-compatible in light and dark mode, and do not trigger line-opening actions.
* Comment state is service-owned, uses `EventTarget` and `useSyncExternalStore`, updates only the affected thread, survives collapse/reopen in the same session, and clears on project or worktree-revision replacement as specified.
* No comment is published, persisted, or sent to an agent, and the UI communicates that comments last only for the current session.
* The card-body Markdown diff, diff error reporting, initial-file navigation, local/remote bridge method names, and repository-root safety checks continue to behave as before.
* Focused tests, app type checking, and both linters pass.
