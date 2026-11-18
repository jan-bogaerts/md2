---
author:
id: F_473
internalId: a7d96183-9b8a-4c2e-a51a-925f7ca9aded
title: tabbed lazy file diff workspace
status: ready
type: feature
owner:
affects:
agents:
  - design/activity/card__a7d96183-9b8a-4c2e-a51a-925f7ca9aded.json
policy:
after: 08b55903-731a-4a0d-be87-6818029c82b2
branch: f_473_tabbed_lazy_file_diff_workspace
worktree: 1
changedFiles:
  - .tmp/f473/desktop_tests.py
  - .tmp/f473/dispatch_tests.py
  - .tmp/f473/remove_config.py
  - app/src/components/card_view/card_commit_diff_panel.test.tsx
  - app/src/components/card_view/card_commit_diff_panel.tsx
  - app/src/components/card_view/diff_workspace/commit_diff_workspace_source.ts
  - app/src/components/card_view/diff_workspace/diff_workspace.tsx
  - app/src/components/card_view/diff_workspace/diff_workspace_file_tab.tsx
  - app/src/components/card_view/diff_workspace/diff_workspace_files_tab.tsx
  - app/src/components/card_view/diff_workspace/diff_workspace_search_button.tsx
  - app/src/components/card_view/diff_workspace/diff_workspace_search_row.tsx
  - app/src/components/card_view/diff_workspace/diff_workspace_search_service.test.ts
  - app/src/components/card_view/diff_workspace/diff_workspace_search_service.ts
  - app/src/components/card_view/diff_workspace/diff_workspace_service.node.test.ts
  - app/src/components/card_view/diff_workspace/diff_workspace_service.ts
  - app/src/components/card_view/diff_workspace/diff_workspace_tabs.tsx
  - app/src/components/card_view/diff_workspace/diff_workspace_types.ts
  - app/src/components/card_view/diff_workspace/worktree_diff_workspace_source.ts
  - app/src/services/data/diff_service.node.test.ts
  - app/src/services/data/diff_service.ts
  - desktop/src/git/diff_service.js
---

## Problem

The card diff panel currently renders the card body first, lists the other changed files, and then renders the complete multi-file patch when a file is selected. `DiffView.initialPath` only scrolls to that file; it does not limit loading or rendering to it. Worktree diff generation also reads and builds patches for every changed file before the file list becomes available.

This makes large commits and worktrees slow, and the selected file is difficult to find in a long vertical view.

## Decision

Keep the existing `CardBodyPopover` and list-view diff containers. Their header, footer, resizing, stacking, focus, mobile, and exit behavior already fit this feature. Do not add another popup type.

Replace the current diff-panel body with a tabbed workspace. Keep the existing read-only `MarkdownEditor` diff presentation for the card file; other file tabs use `react-diff-view`. The workspace owns navigation, lazy loading, and search while the surrounding popup remains unchanged.

## Tabs

* The first tab is always `Files` and is initially active.
* `Files` shows every changed file as a full repository-relative path. A rename is shown as `old/path -> new/path`.
* Selecting a file opens its tab and activates it. Selecting an already-open file activates the existing tab.
* A file tab label is only the filename and extension. Its tooltip and accessible label contain the full path so duplicate filenames remain distinguishable.
* The full path, not the short label, is the tab key and file-selection reference.
* Tabs scroll horizontally when they no longer fit. File tabs are not closable in this feature.
* Open tabs and the active tab reset when the diff source changes or the user exits diff mode.

## Lazy loading

Opening the workspace loads only the changed-file manifest needed by the `Files` tab. It does not load file contents or build patches.

Activating a file tab requests that file's diff. No other file is prefetched. A successfully loaded file may remain cached for the lifetime of that workspace so returning to its tab is immediate. Loading, empty, binary, unavailable, and error states apply to the active file only.

Commit diffs use `CardCommit.filePaths` as their manifest and send the selected path through the existing diff request. The default diff command must use `{{file}}` so Git returns only that path. A custom command without `{{file}}` cannot guarantee lazy loading and must produce a clear configuration error for this workspace instead of silently loading the complete commit.

Worktree diffs require two desktop boundaries:

1. List changed-file metadata from the existing name-status and untracked-file results without reading file contents.
2. Load and build the diff for one selected path, including its old path when renamed.

The local and remote action bridges expose both worktree operations. A stale response from a previous commit, worktree revision, card, or project must not replace the current tab result.

## Search

Add diff-workspace search using the interaction already used by the card and action popups:

* A search button appears in the fixed diff header before the view-mode control and `Exit diff` button.
* `Ctrl+F` opens and focuses the search row while the diff workspace owns focus. `Escape` closes the row, and `F3` selects the next result.
* The row contains the term, result count, previous and next controls, a match-case toggle, and close control.
* On `Files`, search matches full paths and rename paths. Selecting a result scrolls to and focuses its file link; it does not open or load that file.
* On a file tab, search matches only the active tab's rendered old and new text. Selecting a result scrolls to the matching line. Search never loads unopened tabs.
* The term and match-case setting remain while switching tabs, but results are recalculated for the active tab. Search state clears when the diff source changes or diff mode exits.
* The workspace owns `Ctrl+F` in diff mode. The card file's `MarkdownEditor` must not open a second editor-local search row.

Do not reuse `ActionConversationSearchService` directly: it owns conversation-specific DOM and selection behavior. Reuse its control layout and keyboard behavior, and extract only generic text-match helpers if that removes verified duplication.

## State ownership

Add a diff-workspace service that owns the manifest, opened paths, active tab, per-path loading/result/error cache, and search state. It uses `EventTarget` with granular events and components subscribe through `useSyncExternalStore`.

Components only render service snapshots and forward user actions. They do not create or mutate workspace state during render.

Commit hash or worktree revision identifies the diff source. Paths identify file loading and selection locations; they are not card or conversation identity.

## Affected behavior and call sites

* `CardCommitDiffPanel`: receives the tabbed workspace and stops rendering all other diffs below the card body.
* `CardBodyPopover`: keeps its existing shell and diff-mode lifecycle.
* `ListCardCommitDiffPanel`: uses the same workspace inside the existing list-view container.
* `DiffView`: renders one supplied file result in this workspace. `CommitReferenceRow` keeps its current full-commit behavior.
* Commit diff data service and desktop diff service: add an explicit selected-path request without changing full-commit callers.
* Worktree service, desktop dispatcher, preload/local bridge, and remote bridge: add manifest and single-file operations.
* The saved application-wide split/unified setting continues to control every file tab.

## Edge cases

* Duplicate filenames have identical visible labels but distinct full-path tooltips, accessible labels, and tab keys.
* Renamed and deleted files remain selectable by their current manifest entry and load the correct old content.
* A file that disappears after the manifest was loaded shows a file-scoped error; the workspace and other tabs remain usable.
* A commit that is no longer available keeps the existing unavailable message.
* An empty manifest shows `No changed files` on `Files` and opens no file tab.
* Binary and oversized/complex diffs show their existing safe fallback without blocking navigation.
* Inline comments, line clicks, external-editor opening, and the saved split/unified mode continue to work in a lazily loaded file tab.

## Test plan

Add focused tests only:

* Workspace-service tests for manifest initialization, tab reuse, per-path lazy loading, cache reuse, stale-response rejection, reset behavior, and file-scoped failures.
* Component tests for the fixed `Files` tab, full-path links, short file-tab labels, duplicate names, rename labels, horizontal tab navigation, and active-file loading/empty/error states.
* Search-service and control tests for `Ctrl+F`, `Escape`, `F3`, match case, previous/next wrapping, tab-specific result recalculation, Files-path matching, and the guarantee that search does not load unopened tabs.
* Card diff-panel tests confirming that the existing popup/list containers and card-file Markdown diff remain in use, while the former vertical all-file diff is removed.
* Commit data and desktop tests confirming the selected path reaches `{{file}}`, missing placeholders fail clearly for the workspace, and full-commit callers retain their current behavior.
* Worktree desktop and bridge tests confirming manifest listing reads no file contents and a single-file request reads/builds only the selected file, including rename, deletion, binary, stale, and missing-file cases.
* Run the directly affected app and desktop test files plus lint; do not run the complete test suite as part of this job.

## Acceptance criteria

* The existing card popup and list-view diff containers are retained; no new popup type is added.
* `Files` is the first and initial tab and lists full changed-file paths.
* Selecting a path activates one reusable tab whose visible label is only the filename and extension.
* Only the active file starts a diff-content request; unopened files are neither read nor rendered.
* Returning to an already loaded tab does not request it again during the same workspace session.
* Commit and worktree sources both support manifest-first, single-file loading.
* Search behaves like the card/action popup search controls and searches only the active tab without loading another file.
* The existing card-file Markdown diff, inline comments, editor line opening, and application-wide split/unified preference still work.
* Loading and failures are isolated to the active file, and stale responses cannot replace the active source.
* The focused tests and lint pass.

## Out of scope

* Closing, pinning, reordering, or restoring file tabs across popup sessions.
* Searching across unopened files or all files in a commit.
* Replacing the outer card popup, its header/footer, or the normal editable card Markdown editor.
