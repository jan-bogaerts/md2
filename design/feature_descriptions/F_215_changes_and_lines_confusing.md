---
author: 
id: F_215
internalId: 838f9a02-ee42-498c-b317-2f8a48075207
title: changes and lines confusing
status: ready
owner: 
affects:
agents:
  - design/activity/card__838f9a02-ee42-498c-b317-2f8a48075207.json
policy:
branch: f_215_changes_and_lines_confusing
worktree: 1
---

on the action popup, we show the file 'changes' and lines changed.

file changes is counted based on 'filechange' blocks in the conversation, lines changed comes from a git commit.

if both are shown, it becomes confusing. so:

* always use label 'changes'
* only show the git commit value if there is no file-change count in the conversation.

## Current state

`ActionUsageSummary` (`app/src/components/actions/run/popup/action_usage_summary.tsx`) renders three usage controls: `tokens`, `changes`, `lines`. All three share one scope toggle (`conversation` or `actionCard`).

Two of these count edited lines from unrelated sources:

* **changes** — sum of completed `fileChange` events in the conversation transcript, produced by `conversationFileChangeUsage` in `app/src/services/agents/agent_usage.ts`. Provider-reported patch sizes. Rendered `changes: +2 / -1`. Shown when insertions + deletions > 0.
* **lines** — sum of `insertions`/`deletions`/`filesChanged` over `CommitReference` records captured on action-run history entries, aggregated by `lineUsage` in `action_usage_summary_data.ts`. Git commit diff stats. Rendered `lines: 24 (+14 / -10)` since B_142, with per-commit breakdown in tooltip. Shown when total > 0.

When a run has both a transcript with file-change events and a captured commit, both controls appear with different numbers for what a reader takes to be the same quantity. Nothing on screen states the two are measured differently, so the pair reads as a contradiction.

`conversationFileChangeUsage` already returns `null` when the conversation carries no completed `fileChange` event, but `fileChangeUsage` in `action_usage_summary_data.ts` coerces that `null` to `{ insertions: 0, deletions: 0 }`. So "no data" and "data totalling zero" are currently indistinguishable downstream.

## Implementation details

Terms used below:

* **conversation file-change count** — the provider-reported total from completed `fileChange` transcript events. Absent when the scope contains no such event.
* **commit line count** — the Git `--numstat`-derived total from `CommitReference` records on history entries.

Changes:

* `action_usage_summary_data.ts`: widen `ActionUsageValues.changes` to `AgentFileChangeUsage | null`. `fileChangeUsage` returns `null` when every conversation in scope yields `null` from `conversationFileChangeUsage`; otherwise it sums the non-`null` results as today. Absence, not a zero total, is what drives the fallback. Keep `lineUsage` and `scopedActionUsage` scoping rules unchanged.
* `action_usage_summary.tsx`: replace the separate `changes` and `lines` controls with one control, always labelled `changes:`, accessible name `Changes, <scope> scope`.
* Per scope, pick the source: conversation file-change count when present; otherwise commit line count. Resolve the source independently for the conversation value and the action/card value, so the tooltip can report both scopes even when they differ in source.
* Visible format is always `+X / -Y`, insertions in `success.main`, deletions in `error.main`, matching today's `changes` control. Drop the `N (+X / -Y)` total from the visible control; the Git total keeps its place in the tooltip.
* Visibility: hide the control when the active scope has no conversation file-change count **and** no commit line count, or when it has no conversation file-change count and its commit line total is zero. A present conversation file-change count renders even when it totals zero (`changes: +0 / -0`) — the count exists, so the agent genuinely edited nothing.
* Tooltip: state which source the active scope's value came from, e.g. "Changes are additions and deletions across completed provider file-change patches." versus "Changes are additions plus deletions in captured Git commit diffs; the conversation reported no file changes." Keep the existing scope lines (`Conversation (active): …` / `Action/card: …`) and the switch-target sentence. When the active value comes from commits, keep the existing `files changed: …, insertions: …, deletions: …` line and per-commit `abc1234: +6 / -3` lines; when it comes from the conversation, omit them.
* Keep the compact-layout `data-usage-prefix` span, the shared scope toggle wiring, `Intl.NumberFormat` grouping, and the `tokens` control untouched.
* Update `action_usage_summary.test.tsx`: the `Lines, …` accessible name disappears, so every assertion naming it moves to `Changes, …`. Add cases for conversation-present-wins, commit fallback, zero-total conversation count rendering, both-absent hiding, and the two tooltip variants. Adjust the toggle-count test, which currently expects three controls, to two.
* No desktop-side changes: Git capture, `CommitReference` shape, activity schema, persistence, and history loading stay as-is.

## Acceptance criteria

* A scope with completed `fileChange` events and a captured commit shows exactly one control, labelled `changes:`, carrying the conversation file-change numbers; the commit numbers do not appear in the visible control.
* A scope with a captured commit and no `fileChange` events shows `changes:` with the commit insertion/deletion totals.
* A scope with completed `fileChange` events totalling zero shows `changes: +0 / -0` and does not fall back to commit numbers.
* A scope with neither source renders no changes control; `tokens` still renders.
* No control with accessible name `Lines, Conversation scope` or `Lines, Action/card scope` exists anywhere in the popup.
* Tooltip names the active source, lists conversation and action/card values with `Conversation unavailable…` handling intact, and shows per-commit lines only when the active value is commit-derived.
* Clicking the changes control still invokes the shared scope toggle; token totals, scope persistence, commit capture, and history loading are unchanged.
* `npm run typecheck` passes and focused `action_usage_summary` unit and component tests pass.