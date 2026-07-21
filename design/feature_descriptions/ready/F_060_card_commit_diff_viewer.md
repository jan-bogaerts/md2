---
id: F_060
title: card commit diff viewer
status: ready
owner: JB
affects:
  - shared/activity_paths.mjs
  - app/src/data/action_context.ts
  - app/src/data/electron_action_bridge.ts
  - desktop/src/actions/action_execution.js
  - desktop/src/actions/action_files.js
  - desktop/src/actions/agent_conversation_persistence.js
  - desktop/src/actions/agent_runner_service.js
  - desktop/src/actions/activity_files.js
  - desktop/src/git/diff_service.js
  - desktop/src/git/worktree_service.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
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

From a card, show every Git commit produced by a root action run started on that card. Selecting a commit shows the card body diff in place of the editor and gives access to other files changed by the commit.

## Source note

`design/architecture/initial description/card_dif.md`:

> Card popup shows diff icon when commits available. All commits done during agent run, done on the card. When clicked, shows context menu with all available commits, labeled `action + date & time (short)`. Markdown editor should already support showing diffs; we also have react-diff-viewer-continued.

## Current state

F_055/F_056 collect `CommitReference[]` for one root action chain, including commits from linked `onBefore`/`on`/`onAfter` actions. Current persistence is unsuitable for card history:

- action history is split into path-derived, per-action files under the ignored `logs` folder — unstable identity (collides after moves/normalization) and stored per-worktree instead of one project-owned location;
- conversation files are persisted before execution and rewritten ~every 250 ms, even though live rendering uses in-memory events;
- `ActionContext` has the card path but not its stable `header.internalId`;
- `generateDiff(commitReference)` renders via `project.diffCommand`, and `DiffView` already renders whole-commit diffs;
- card popup and file-mode toolbar have no card commit control;
- the markdown editor doesn't register MDXEditor's `diffSourcePlugin`.

No existing project data or compatibility migration must be supported.

## Project activity storage

Activity is project data and must be committed so every collaborator can see it. Replace ignored `logs` persistence with tracked files in the **primary checkout**:

- card activity: `<projectFolder>/activity/card__<cardInternalId>.json`;
- project-origin activity: `<projectFolder>/activity/project.json` (no card id).

One card file owns all action-run and conversation activity for that card, filed by `header.internalId` — never path, title, display id, or normalized path prefix.

The renderer adds `cardInternalId` to every card/file `ActionContext`; a card-origin execution without it fails before starting. The root execution snapshots its origin once; child actions inherit it even in another worktree.

Each completed root execution appends one `ActionActivityRecord` with at least:

- `executionId`, start/completion timestamps, terminal status;
- root action `id` and snapshotted `label`;
- origin kind and, for card origin, `cardInternalId`;
- all commit references from the root and child actions, in execution order;
- conversation ids created by that execution.

Each commit reference keeps full hash, timestamp, source branch, changed paths/counts, and performer action id/label when different from the root action — never a filesystem path for card ownership. Absolute `repositoryRoot` paths are machine-local and must not be required in tracked activity data.

All reads/writes use the primary project root, even for actions executed in a linked worktree. A project-scoped activity writer serializes read-modify-write, writes atomically, then commits only the changed activity file via `commitTrackedPaths` — after action commit collection, and not itself added to the activity record.

## Conversation persistence

Running conversations stay in `AgentRunnerService` memory; structured events keep streaming directly to the live UI.

Write the conversation to its activity file once, when the turn reaches `completed`, `failed`, or `cancelled` — finishing the atomic write before the terminal `closed` event publishes. Remove initial and throttled intermediate writes.

A hard crash may lose the unfinished turn; completed/failed/cancelled turns remain persisted. Continuation only reads terminally persisted conversations; concurrent turns for one conversation stay forbidden.

## Commit visibility

Commits made in a linked worktree are visible through the primary checkout (shared Git object database), so diff commands run from the primary repository root with the stored hash.

For each stored commit:

- show it when reachable from primary branch HEAD;
- before merge, also show it when its source branch belongs to a currently valid, registered worktree and the commit is reachable from that branch;
- once its worktree is no longer valid/registered and it's unreachable from primary HEAD, treat it as discarded and hide it (record stays in activity);

Supports the app's normal full-branch merge flow only — no inference across patches, rebases, squash merges, or cherry-picks. Ancestry is used solely to tell merged worktree commits from discarded ones after the worktree disappears.

Visibility is re-evaluated on activity load and after project/worktree state changes. A visible hash whose Git object is unavailable locally keeps its row and reports unavailability on selection.

## Commit menu

- `SourceCommit` icon in the card popup header, between Dirty/Saved and Close; same control in `ListEditorToolbarControls` beside Agents/Properties for file-mode cards.
- Hidden when no visible commits exist; count badge when more than one.
- Newest first across activity records, labeled `<root action label> · <short date & time>` (user locale).
- Secondary text: short hash and `+insertions/−deletions`; full hash as row `title`.
- Reloads after an action execution for this `cardInternalId` completes, and after worktree/project state changes.
- All records persist; no exact UI cap required — a reasonable display limit (e.g. 50) may be applied for performance, with older entries stated as hidden. Paging not required.

## Picking a commit

Selecting a commit enters diff mode on that card surface:

- compares the card file at `<commit>^` vs `<commit>`, each run through `markdownParsingService.parse(content).body` so frontmatter is excluded;
- replaces the live editor visually with a separate read-only `MarkdownEditor` (`diffSourcePlugin`, `viewMode: 'diff'`) — historical content never enters the live editor or its autosave/dirty/history services;
- shows root action label, full timestamp, short hash, and an **Exit diff** control above the diff;
- first `Escape` exits diff mode and keeps the popup open; a second `Escape` closes the popup; closing the popup also clears diff mode.

If the commit didn't touch the card's current file path, skip body diff mode and open the other-files list directly (card rename tracking out of scope).

Below the body diff, an **Also changed (n)** row lists other changed paths; selecting one opens existing `DiffView` for the whole commit, scrolled to that file, with existing `openInEditor` line-click behavior.

## Bridge and renderer changes

Add action-bridge methods through preload, local dispatch, `ElectronActionBridge`, and remote-control proxy:

- `loadCardActivity({ cardInternalId }): Promise<CardActivityFile>` — reads the primary checkout activity file, validates it, filters commit visibility, returns activity for that card identity;
- `readFileAtCommit({ commit, path, parent }): Promise<{ content: string, exists: boolean }>` — runs `git show <commit>[^]:<path>` from the primary repository root; missing paths, and a missing parent for a root commit, return `{ content: '', exists: false }`.

Git paths are repository-relative and pass existing root/path validation. Malformed activity is a visible load error, not silently treated as empty history.

Renderer responsibilities:

- `card_commit_history.ts` loads/validates card activity; no execution bridge means no commits;
- `use_card_commits.ts` keys requests by `cardInternalId`, refreshes on matching root execution completion and worktree/project changes, discards stale async results after card change/unmount;
- card popup and file mode share `CardCommitMenu`/`CardCommitDiffPanel`, each with independent diff selection state;
- historical diff uses a separate read-only editor instance; whether the live editor stays mounted is an implementation detail, but historical content must never enter live editor state or persistence pipelines.

## Edge cases

- No commits from a root run: activity still records the run/conversation; icon stays hidden.
- Linked actions commit on different worktree branches: one root activity record, visibility evaluated per commit.
- Worktree commit before merge: visible while worktree valid/registered.
- Worktree removed after full merge: stays visible (reachable from primary HEAD).
- Worktree removed without merge: hidden but retained in activity.
- Commit object unavailable locally: row stays if otherwise visible; selecting shows `Commit is no longer available in this repository`.
- Root commit: old body empty, new body renders as added.
- Frontmatter-only commit: show `No body changes in this commit`, then other changed files.
- Card renamed after commit: current path may not exist at either revision; show only other changed files.
- Card deleted or surface closed while loading: discard result.
- Two local executions update one card: writer serializes writes, keeps separate `executionId` records.
- Two collaborators edit the same tracked activity file on different branches: normal Git conflict handling applies.

## Acceptance criteria

- Activity stored once per card under tracked `<projectFolder>/activity`, keyed by `cardInternalId`, written in the primary checkout regardless of execution worktree.
- One root execution creates one activity record with commits from root + all child actions, plus root action id/label and card identity.
- No path-prefix aggregation or path-derived card ownership remains.
- Conversation turns write once at terminal completion/failure/cancellation; live UI keeps streaming from memory.
- A card with commits from two root executions shows one icon, newest first.
- Unmerged commits from valid registered worktrees are viewable before merge; remain visible after full merge; hidden if worktree removed unmerged.
- Selecting a commit that touched the card shows a read-only body diff (first parent vs. commit) without changing dirty/autosave/history state.
- First `Escape` exits diff mode keeping popup open; second `Escape` closes popup.
- Selecting a commit that didn't touch the current card path opens other changed files without entering body diff mode.
- Other-file diff and VS Code line opening work locally and through remote control.
- Same menu/diff behavior in card popup and file mode.
- Missing bridge hides icon; malformed activity reports a visible error.
- Tests cover: stable-id storage, root/child aggregation, serialized atomic writes, single terminal conversation write, primary/worktree visibility, discarded worktree hiding, full-merge retention, missing commit, root commit, frontmatter-only diff, Escape order, both toolbar hosts, remote proxy, no live-editor persistence side effects.

## Documentation impact

Update F_050/F_012 conversation persistence wording and F_056 history ownership/storage wording. No migration or legacy schema support required.

## See also

- `design/architecture/initial description/card_dif.md`
- `design/feature_descriptions/F_055_agent_file_change_tracking.md`
- `design/feature_descriptions/F_056_root_action_commit_history.md`
- `design/feature_descriptions/ready/F_050_one_shot_agent_conversations.md`
- `app/src/components/actions/action_commit_dropdown.tsx`
- `app/src/components/actions/diff_view.tsx`
- `desktop/src/git/diff_service.js`
- `desktop/src/git/worktree_service.js`
