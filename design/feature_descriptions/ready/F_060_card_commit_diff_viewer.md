---
id: F_060
title: card commit diff viewer
status: design
owner: JB
affects:
  - shared/log_paths.mjs
  - desktop/src/actions/action_files.js
  - desktop/src/actions/project_log_paths.js
  - desktop/src/git/diff_service.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
  - app/src/data/electron_action_bridge.ts
  - app/src/services/data/remote_control_storage_service.ts
  - app/src/services/data/diff_service.ts
  - app/src/services/actions/card_commit_history.ts
  - app/src/components/hooks/use_card_commits.ts
  - app/src/components/card_view/card_body_popover.tsx
  - app/src/components/card_view/card_body_editor.tsx
  - app/src/components/card_view/card_commit_menu.tsx
  - app/src/components/card_view/card_commit_diff_panel.tsx
  - app/src/components/text_view/text_view.tsx
  - app/src/components/text_view/list_editor_toolbar_controls.tsx
policy:
  checkLinting: true
  requireTests: true
---

## Goal

From a card, let the user see what agent runs actually changed. The card details popup (and the same card opened in file mode) gets a diff icon that lists every commit produced by any action run on that card; picking one shows the card's own body diff in place of the editor and gives access to the other files the commit touched.

## Source note

`design/architecture/initial description/card_dif.md`:

> Card popup shows diff icon when commits available
> - all commits done during agent run, done on the card.
> - when clicked, shows context menu with all available commits. use action + date & time (short) as menu item labels.
> - markdown editor component should already support showing diffs, we also have react-diff-viewer-continued.

## Current state

F_055/F_056 already produce and persist the data this feature needs:

- One action run persists an `ActionRunHistoryEntry` with `commits: CommitReference[]` (root-owned, chain order) into `<projectFolder>/logs/history__card__<scope>__<actionId>.json`, named by `historyLogFileName` ([shared/log_paths.mjs](../../../shared/log_paths.mjs)). `<scope>` is derived from the card's `context.file`, so **all** action history for one card shares a filename prefix.
- `CommitReference` carries `actionId`, `actionName`, `branch`, `commit`, `committedAt`, `repositoryRoot`, `filePaths`, and the insertion/deletion/file counts.
- `generateDiff(commitReference)` ([app/src/services/data/diff_service.ts](../../../app/src/services/data/diff_service.ts)) renders a commit through the configured `project.diffCommand` template (default `git show {{commit}}`) and returns normalized `DiffFile[]`; `DiffView` renders it with `react-diff-viewer-continued` and opens VS Code on a line click.
- The **action** popup already has this shape for a single action: `ActionCommitDropdown` → `CommitReferenceRow` → `DiffView`.
- `loadActionRunHistory` only reads one `(actionId, context)` pair. There is no way to ask for "everything that happened to this card", and no way to read a file's content at a given commit.
- The card popup ([card_body_popover.tsx](../../../app/src/components/card_view/card_body_editor.tsx)) has no commit affordance. The markdown editor does not currently register MDXEditor's `diffSourcePlugin`.

## Behavior

### Commit collection

- A card's commit list is the union of `commits[]` from **every** `history__card__<scope>__*.json` file whose `<scope>` matches the card's context — i.e. every action ever run on that card, including actions that were since renamed, deleted, or no longer match the card's `appliesTo`.
- Deduplicate by `repositoryRoot` + `commit`. Sort newest `committedAt` first. Cap at 50; older commits are dropped, not paged.
- Legacy singular `commit` records are not read (F_056 decision, 2026-07-17).
- The list is scoped to the card, not to the file the commit touched: a commit made by a run on this card is listed even if it never touched the card's own markdown file.

### Icon and menu

- A commit icon (`SourceCommit`, matching `ActionCommitDropdown`) sits in the **card popup header bar**, between the Dirty/Saved indicator and the Close button. The same control appears in **file mode** (`text_view`) as an end control in `ListEditorToolbarControls`, next to Agents/Properties, for card documents only.
- The icon is hidden when the card has no commits. It shows a count badge when there is more than one.
- Clicking opens a menu listing each commit, newest first, labelled **`<actionName> · <short date & time>`** using the user's locale (`dateStyle: 'short', timeStyle: 'short'`). The short hash and `+insertions/−deletions` are shown as dimmed secondary text on the row; the full hash is the row's `title`.
- The menu re-reads its data when an action execution for this card completes, so a run finishing while the popup is open adds its commits without reopening.

### Picking a commit

Selecting a commit enters **diff mode** for that card surface:

- The card body editor is replaced in place by a read-only diff of the card's markdown **body** (frontmatter/header block excluded, matching what the editor normally renders), rendered with MDXEditor's `diffSourcePlugin` in `viewMode: 'diff'`.
- The diff is **commit vs its first parent**: old side = card file at `<commit>^`, new side = card file at `<commit>`. It shows what that run changed, not what changed since.
- A header strip above the diff shows the action name, full timestamp, short hash, and an **Exit diff** control returning to the live editor. `Escape` and closing the popup also exit diff mode.
- If the commit did not touch the card's own file, the editor is not switched; the menu row goes straight to the other-files list.
- Below the diff, an **"Also changed (n)"** row lists the commit's other `filePaths`. Clicking one opens the existing `DiffView` in a popover for the whole commit, scrolled to that file, with its existing click-a-line-to-open-VS-Code behaviour.

### Availability

- The feature requires an execution bridge (`getElectronActionBridge()`), which is satisfied both by Electron local mode and by a remote-control connection — `generateDiff`, `openInEditor`, and the new methods are all proxied by `remote_control_storage_service`. The icon is hidden when there is no bridge (GitHub-only mode in a plain browser).
- `openInEditor` opens VS Code on the **desktop** host; that is accepted behaviour when triggered from a remote client.

## Implementation notes

### New bridge methods

Both are action-bridge methods (add to `ACTION_METHODS` in [preload.js](../../../desktop/src/shell/preload.js), to `local_bridge_dispatch.js`, to `ElectronActionBridge`, and to `remote_control_storage_service.ts`):

- `loadCardCommitHistory({ context, projectFolder }): Promise<CommitReference[]>` — desktop-side, in `action_files.js`. Computes the card's scope value with a new exported helper in `shared/log_paths.mjs` (extract the `history__card__<scope>__` prefix construction out of `historyLogFileName` so both sides use one implementation), lists the project log folder, reads every matching file, normalizes with the existing `normalizeActionHistoryEntry`/`isUsableCommitReference` guards, then flattens, dedupes, sorts, and caps. Unreadable or malformed files are skipped, not fatal.
- `readFileAtCommit({ repositoryRoot, commit, path, parent }): Promise<{ content: string, exists: boolean }>` — in `desktop/src/git/diff_service.js`. Runs `git show <commit>[^]:<path>` with `cwd: repositoryRoot`. A missing path at that revision (file added by the commit, or a root commit with no parent) returns `{ content: '', exists: false }` rather than throwing. `path` must pass `ensureInsideRoot`.

`CommitReference.filePaths` and `path` are relative to `CommitReference.repositoryRoot`, which may be a worktree, not the project root. Resolve the card's file path against `repositoryRoot` before comparing or reading — do not assume it equals the project root.

### Renderer

- `app/src/services/actions/card_commit_history.ts` — thin loader over the bridge; returns `[]` when no bridge is present. Keep the dedupe/sort/cap assertions covered by tests here too, so the renderer does not trust bridge ordering.
- `app/src/components/hooks/use_card_commits.ts` — loads for a card path, resubscribes on action-execution completion for that file (same source as `useRunningActionForFile`), cancels on unmount/card change via the existing `isActive` pattern.
- Diff mode renders a **separate, read-only `MarkdownEditor` instance** rather than switching the live editor's content. The live editor stays mounted-or-remounted with the card's real body so the autosave/dirty pipeline and `markdown_document_history_store` never see historical content. This is deliberate: feeding old content into the live editor would make the commit batcher persist it.
- Body extraction on both sides uses `markdownParsingService.parse(content).body`, so a commit that only changed frontmatter produces an empty diff — show "No body changes in this commit" and the "Also changed" list.
- Card and file-mode surfaces share one `CardCommitMenu` + `CardCommitDiffPanel` pair; only the toolbar host differs.
- The existing `generateDiff` passes `filePaths[0]` as the template's `{{file}}`; the default template ignores it. Leave that untouched — the "Also changed" popover wants the whole-commit diff.

## Edge cases

- Card has runs but no commits → icon hidden.
- Commit exists in history but the object is gone from git (worktree pruned, branch deleted, history rewritten): the row still lists, selecting it shows "Commit is no longer available in the repository" and offers no diff.
- Card file was renamed after the commit: `readFileAtCommit` for the current path returns `exists: false` on both sides → treat as "commit did not touch this card's file" and show only the other-files list. Rename following is out of scope.
- Root commit (no parent) → old side is empty; the whole body renders as added.
- Binary or very large files in "Also changed" are handled by the existing `DiffView`/`parseUnifiedDiff` behaviour; this feature adds no new handling.
- More than 50 commits: only the newest 50 are listed, and the menu footer states that older commits are not shown.
- Card deleted or popup closed while a diff is loading: the in-flight load is discarded.
- Two cards open in file mode: each tab keeps its own independent diff-mode state.
- Commits recorded against a worktree that has since been removed: `repositoryRoot` no longer exists → same "no longer available" message.

## Acceptance criteria

- A card with commits from two different actions shows one icon whose menu lists both, newest first, labelled with action name and short local date/time.
- A card with no commits, or a session with no execution bridge, shows no icon.
- Selecting a commit that touched the card replaces the editor with a read-only body diff of `<commit>^` → `<commit>`; exiting restores the live editor with the card's current body and no dirty state, and no commit is written as a result of entering or leaving diff mode.
- Selecting a commit that did not touch the card's file shows the "Also changed" list without switching the editor.
- Clicking a file in "Also changed" opens the existing `DiffView` for that commit, and clicking a line opens VS Code.
- The same icon, menu, and diff behaviour work in file mode.
- A run completing while the popup is open adds its commits to the menu without reopening the popup.
- Commits produced by an action that was since deleted from the actions folder still appear.
- The same feature works over a remote-control connection.
- Tests cover: multi-action aggregation and dedupe, ordering and the 50 cap, malformed/unreadable history files, scope matching for the card path, `readFileAtCommit` for added/missing/root-commit cases, worktree-relative path resolution, diff-mode enter/exit leaving the live editor and autosave untouched, frontmatter-only commits, missing-commit rendering, and both toolbar hosts.

## See also

- `design/architecture/initial description/card_dif.md`
- `design/feature_descriptions/F_055_agent_file_change_tracking.md`
- `design/feature_descriptions/F_056_root_action_commit_history.md`
- `app/src/components/actions/action_commit_dropdown.tsx`
- `app/src/components/actions/diff_view.tsx`
- `desktop/src/git/diff_service.js`
- `shared/log_paths.mjs`
