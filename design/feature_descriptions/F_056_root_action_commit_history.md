---
id: F_056
title: group action-chain commits under the root action run
status: ready
owner: JB
affects:
  - desktop/src/actions/action_execution.js
  - desktop/src/actions/action_run_history.js
  - shared/action_history.mjs
  - app/src/data/electron_action_bridge.ts
  - app/src/components/actions/action_run_history.tsx
  - app/src/components/actions/diff_view.tsx
  - app/src/services/diff_service.ts
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Show every Git commit produced during one action-chain execution on the history entry for the root action and card that started the execution.

## Current state

`ActionExecution` knows the root action and publishes `rootActionId`, but it persists history after each individual action. `action_run_history.js` keys that write by the currently executing `action.id` and stores at most one singular `commit` on that action's entry. Therefore a commit made by an `onBefore`, matching `on`, or `onAfter` action belongs to that linked action's history instead of the UI-triggered root action's history.

Two commit paths exist:

- command actions parse a Git commit summary from command output through `extractCommitSummary`;
- agent actions with `trackFileChanges: true` ask md2 to commit provider-reported changed paths through `commitTrackedPaths` and use the returned hash directly.

The second setting currently belongs to the agent action definition, not the card. Both paths attach the commit to the executing action. `CommitMetadata.actionId` identifies that action, but no action name is persisted. `completedAt` is reused as the commit time. `ActionRunHistory` and `DiffView` assume one commit per history entry.

## Behavior

- Define the **root action** as the action named by the execution start request. For a card button this is the action the user selected in the UI. Scheduled and state-triggered executions use their start-request action as root too.
- Collect commit references in execution order for the whole root execution, across the root action and all recursively invoked `onBefore`, matching `on`, and `onAfter` actions.
- Persist collected references as `commits: CommitReference[]` on one root activity record in the stable card/project activity file. One root invocation remains one activity record.
- Do not attach those commit references to linked-action history entries. A linked action still keeps its own output/status history entry. When that same action is started directly, it becomes root and owns commits from that execution.
- Preserve existing history-entry output, prompt, command, agent, and status semantics. This feature changes commit ownership and cardinality only.
- Apply the same ownership rule to both detected command-action commits and md2-created tracked-file commits.

Each `CommitReference` stores:

- stable performer `actionId`;
- performer `actionName`, snapshotted from the executed action definition so later renames do not rewrite history labels;
- full commit hash, source branch, and changed file paths/counts needed by the diff flow; absolute repository roots are runtime-only and are not tracked;
- `committedAt`, read from Git for the referenced commit rather than inferred from root-run completion time.

## Implementation notes

- Add an execution-scoped commit accumulator to `ActionExecution`. Commit creation/detection returns references to that accumulator; history persistence must not use global or action/card-only mutable state because concurrent runs can share the same root action and card.
- Defer persistence of the root action's history entry until its chain has finished, so commits from `onAfter` and matching `on` actions are included. Persist linked-action entries without commit metadata.
- Keep source branch on each reference. Resolve Git operations against the primary checkout at runtime; machine-local worktree roots never enter tracked activity.
- Replace singular summary extraction with extraction of every Git commit summary in command output. Deduplicate repeated references by commit hash while preserving first-seen execution order.
- Resolve each detected commit's Git timestamp and changed paths at capture time. A failure to resolve required metadata fails history recording clearly; do not invent empty paths or timestamps.
- Change diff generation to accept one `CommitReference`. Each commit row owns its own Show/Hide diff state and uses its own repository metadata.

## UI

In the card action popup, a commit-history icon sits in the top-right toolbar, before the conversation-history dropdown. It opens a dropdown listing every commit from the action's runs (newest run first; commits inside one run keep chain execution order). The icon is hidden when there are no commits. Each row shows:

- localized commit date and hour;
- performer action name (the action that performed the commit is only used in this label);
- short commit hash;
- an independent Show diff / Hide diff control.

The non-agent run-history list keeps the same per-run commit rows inline. Runs without commits show no commit section.

## Edge cases

- Several linked actions commit during one root run: all commits appear once on the root entry in execution order.
- One command action emits several Git commit summaries: each distinct commit becomes a reference.
- A command creates a commit and later exits non-zero, or a later chain phase fails: the already-created commit remains listed on the root entry.
- A tracked agent reports no changed paths or `commitTrackedPaths` returns no commit: add no reference.
- Concurrent executions for the same root action and card never mix commits; `executionId` scopes in-memory collection.
- Cancellation stops later actions but retains references for commits completed before cancellation.
- Card rename/move keeps activity ownership because storage is keyed by stable `header.internalId`; historical body lookup still uses the card's current path, so rename tracking is outside this feature.

## Persisted-history compatibility decision

Existing history JSON contains singular `commit` records. This request does not specify migration or legacy rendering. Before implementation, choose either a one-time data migration to `commits[]` or intentional removal of old commit-diff visibility. Do not add an implicit dual-schema fallback without that decision.

**Decision (2026-07-17, JB):** intentional removal. Legacy singular `commit` records are not migrated and no longer render a diff; only `commits[]` is read.

## Acceptance criteria

- Running a card root action whose `onBefore`, root, and `onAfter` command actions each commit creates one root history entry containing three ordered commit references.
- Linked-action history entries from that execution contain no commit references; directly running one of those actions makes it root and gives its history entry ownership.
- Tracked-file auto-commits and commits parsed from command output follow identical root ownership rules.
- Every displayed commit shows Git date/hour, performer action name, and short hash; each commit opens its own correct diff.
- Multiple commits from one command output are retained and duplicate summaries are shown once.
- Failed and cancelled executions retain commits completed before failure/cancellation.
- Two concurrent runs of the same root action/card pair keep separate commit lists.
- Tests cover root/linked ownership, all chain phases, command and tracked-file commit paths, multiple summaries, independent worktrees, failure/cancellation, concurrency, timestamp/name display, and per-commit diff toggles.

## See also

- `design/architecture/initial description/actions.md`
- `design/feature_descriptions/F_055_agent_file_change_tracking.md`
- `desktop/src/actions/action_execution.js`
- `desktop/src/actions/action_run_history.js`
- `shared/action_history.mjs`
- `app/src/data/electron_action_bridge.ts`
- `app/src/components/actions/action_run_history.tsx`
- `app/src/components/actions/diff_view.tsx`
- `app/src/services/diff_service.ts`
