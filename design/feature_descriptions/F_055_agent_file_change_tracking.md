---
id: F_055
title: optional file-change tracking for agent tasks (worktree-free concurrency)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Today an agent action that must produce an isolated, attributable change relies on a **git
worktree** (`needsWorkTree`, `desktop/src/actions/action_worktree_execution_service.js`). A worktree
gives each run its own checkout + branch, so several agents can run at once without their writes
colliding, and the resulting commit is cleanly scoped to that run.

Worktrees are the right tool for heavier actions, but they are overkill for light ones — a **custom
prompt** or a small single-card task. For those we still want to run several at once (e.g. one per
card) without paying the worktree cost (extra checkout, branch bookkeeping, VS Code switching
context). The blocker to running them concurrently on the **shared** working tree is not git itself —
it is that md2 cannot tell which files a given run changed:

- The commit hash md2 records is parsed out of the agent's own stdout
  (`extractCommitSummary` in `shared/action_history.mjs`, consumed by
  `desktop/src/actions/action_run_history.js`). The agent self-commits **everything staged**, so two
  concurrent runs on one tree capture each other's in-flight edits into the wrong commit.
- The `filePaths` stored on the history entry is a **guess** — `input.context.file ? [context.file]
  : []` (`action_run_history.js:17`) — not the files actually touched. The "Show diff" view
  (`app/src/components/actions/diff_view.tsx`) works off the commit hash, but attribution is wrong
  whenever the agent touches anything other than the context card.

The provider JSONL already contains the truth. Claude `assistant` events carry `tool_use` blocks
(`Edit` / `Write` / `MultiEdit`) whose `input.file_path` names the file; Codex `item.completed`
events for patch items carry `item.path` / `item.changes`
(`desktop/src/actions/agent_transcript.js` already reaches these fields for display, then discards the
structure). We parse these streams today (`AgentProviderProtocolParser`,
`desktop/src/actions/agent_provider_protocol.js`) but never extract a structured touched-file set.

## Fix

Add an opt-in **`trackFileChanges`** boolean to agent action definitions, default `false`, mutually
useful with (not a replacement for) `needsWorkTree`. When set, md2 derives the changed-file set from
the provider stream and does its own **scoped** commit instead of trusting the agent's blanket
self-commit, so concurrent runs on the shared tree stay isolated at commit granularity.

- **Schema.** Add `trackFileChanges` to `ACTION_DEFINITION_FIELDS` / `ROUTABLE_FIELDS` and the
  validator + normalizer in `shared/action_definitions.mjs` (mirror `needsWorkTree`:
  `value.trackFileChanges ?? false`, boolean-typed, routable error field). Serialize it in
  `app/src/services/action_service.ts` only when truthy. It is only meaningful for `type: 'agent'`
  actions — reject/ignore it elsewhere the same way other agent-only fields are handled.
- **Editor.** Surface it as a checkbox in the agent section of the action editor
  (`app/src/components/actions/action_editor.tsx`), next to the worktree control, labelled so the
  trade-off is clear (e.g. "Track changed files (run without a worktree)").
- **Capture touched files.** In the provider protocol layer
  (`desktop/src/actions/agent_provider_protocol.js`), emit a structured `changedPaths` signal from
  tool events:
  - Claude: `tool_use` blocks named `Write` / `Edit` / `MultiEdit` (and `NotebookEdit`) →
    `input.file_path` / `input.notebook_path`.
  - Codex: patch/file `item.completed` items → `item.path`, or the file list inside `item.changes`.
  - Normalize every captured path to **repo-relative, root-confined** (reuse the
    `resolveInsideRoot` guard style from `desktop/src/git/diff_service.js`); drop anything escaping
    the project root.
- **Scoped commit.** When `trackFileChanges` is on and the run touched at least one in-root file,
  md2 stages exactly those paths and commits them itself
  (`git add <paths…>` then `commitStagedChanges`, `desktop/src/git/git_commands.js`), producing the
  commit hash directly rather than parsing it from stdout. Record the real `filePaths` (the captured
  set) and the resulting commit on the history entry. In this mode the agent profile should **not**
  self-commit — the run is the committer — so the two paths don't double-commit.
- **Diff view unchanged.** Because md2 still produces a real commit, the existing commit-based
  "Show diff" (`diff_view.tsx` → `diff_service`) keeps working with no renderer change; it now shows
  the correct files because `filePaths` is real.
- **Default path untouched.** With `trackFileChanges` off, behaviour is exactly as today
  (worktree when `needsWorkTree`, agent self-commit + stdout parse otherwise).

## Edge cases

- **Out-of-band writes.** If the agent changes files via a shell command / script rather than a
  tracked tool call, those writes are invisible to the JSON stream and will be missed by the scoped
  commit. This mode is therefore for light, tool-call-driven tasks; actions that shell out to modify
  files should use `needsWorkTree` instead. Document this limitation on the editor control.
- **Two concurrent runs touching the same file.** Scoped commit isolates *distinct* file sets; if two
  shared-tree runs write the *same* file their on-disk writes still race. This mode targets runs on
  disjoint files (typically one card each) — it does not make same-file concurrency safe. Worktree
  remains the answer there.
- **Deletions / renames.** A deleted file must still be staged (`git add` records the deletion);
  renames appear as delete+add in the stream — stage both sides so the commit is complete.
- **No files touched.** A run that changes nothing produces no commit and no `filePaths`; the history
  entry records the run without a diff button, same as a no-op today.
- **Provider schema drift.** Tool-event shapes differ across CLI versions; unknown/renamed tool names
  must degrade to "no tracked path" (fall back to the untracked commit behaviour or an empty diff),
  never crash the turn — malformed provider events are already tolerated.
- **Path outside the working folder / project root.** Rejected by the root-confinement guard and
  excluded from the commit, never staged blindly.
- **Cancelled / failed turn.** Commit only on the terminating success path; a cancelled run stages
  nothing.

## acceptance criteria

- `trackFileChanges` round-trips through parse → normalize → serialize on an agent action, defaults
  to `false`, and is rejected when non-boolean (routed to the field like `needsWorkTree`).
- The action editor shows the checkbox for agent actions and persists it.
- After a tracked Claude run, the recorded `filePaths` equals the set of `file_path`s from its
  `Write`/`Edit`/`MultiEdit` tool_use blocks; after a tracked Codex run it equals the paths from its
  patch items — in both cases repo-relative and root-confined.
- The commit md2 records in tracked mode contains **only** the tracked files, and its hash comes from
  md2's own commit (not from parsing agent stdout).
- "Show diff" on a tracked run shows exactly the tracked files with correct content, using the
  existing commit-based diff renderer unchanged.
- Two tracked agent runs on the shared tree that touch disjoint files each produce a commit scoped to
  their own files, with neither capturing the other's changes.
- A tracked run that touches no in-root file produces no commit and no diff button; a run whose only
  writes are out-of-band is documented as unsupported (missed), not a crash.
- With `trackFileChanges` off, existing worktree and self-commit behaviour is byte-for-byte unchanged.
- Tests cover: schema round-trip + validation, Claude and Codex changed-path extraction,
  path normalization/root-confinement, scoped commit contents, no-op run, malformed-event tolerance,
  and disjoint-file concurrency attribution.

## see also

- `shared/action_definitions.mjs`
- `app/src/services/action_service.ts`
- `app/src/components/actions/action_editor.tsx`
- `desktop/src/actions/agent_provider_protocol.js`
- `desktop/src/actions/agent_transcript.js`
- `desktop/src/actions/action_run_history.js`
- `desktop/src/actions/action_worktree_execution_service.js`
- `desktop/src/git/git_commands.js`
- `desktop/src/git/diff_service.js`
- `app/src/components/actions/diff_view.tsx`
- `shared/action_history.mjs`
