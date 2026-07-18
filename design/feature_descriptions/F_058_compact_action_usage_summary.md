---
id: F_058
title: show compact token and changed-line usage summaries
status: ready
owner: JB
affects:
  - desktop/src/actions/action_run_history.js
  - desktop/src/git/git_commands.js
  - app/src/components/actions/action_popup.tsx
  - app/src/components/agents/agent_usage_display.tsx
  - app/src/components/card_view/card_body_popover.tsx
  - app/src/components/shell/project_agent_usage_summary.tsx
  - app/src/data/electron_action_bridge.ts
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Keep usage information visible without filling the interface with token categories, and show how many lines the current action changed on the current card.

## Current state

F_054 stores normalized token usage on agent conversations. `AgentUsageDisplay` renders the total, input, cached input, output, reasoning, and optional cost inline. It is used in the card footer and in the project/version usage popup, where the repeated labels create excessive text.

F_056 stores every commit produced by a root action chain in `commits[]` on that root action's card-context history entry. Each `CommitReference` contains the repository and commit hash, but no diff statistics. The action popup already loads only the history for its current action and context, so it is the authoritative source for the commits included in an action/card summary.

## Behavior

- Replace the expanded inline token breakdown with a compact `tokens: <total>` label.
- Show the input, cached input, output, reasoning, and provider-reported cost in a tooltip on that label. Omit cost when no provider reported it.
- Apply the compact token presentation everywhere `AgentUsageDisplay` is used. The project usage popup keeps its project/current/release grouping, but each row shows only its total until hovered or focused.
- In an agent action popup opened for a card, show one compact summary for that action and card:
  - `tokens: <total>` is the sum of the loaded conversations whose `actionId` and `cardPath` match the current action and card;
  - `lines: <total>` is the sum of insertions and deletions reported for every commit in the loaded root-action history for that same action and card.
- Show `lines` only when the current action/card history contains at least one commit. A commit with no textual changes still produces `lines: 0`.
- The line tooltip shows total files changed, insertions, and deletions, followed by the short hash and insertion/deletion counts for each commit in run order. The existing commit-history popup remains the place to inspect commit metadata and full diffs.
- Project-context actions have no card and therefore do not show the combined action/card summary.

## Data and implementation

- Extend `CommitReference` with required non-negative integer fields `filesChanged`, `insertions`, and `deletions`. Compute `totalLines` as `insertions + deletions`; do not persist a second derived total.
- Resolve these fields together with the existing timestamp and changed paths when a commit is captured. Run Git's short-stat diff for the referenced commit in its own `repositoryRoot` and parse the optional file, insertion, and deletion counts from `git diff --shortstat`. Missing categories in valid Git output mean zero.
- Root commits must use the root-safe equivalent of the same short-stat diff. Merge commits use Git's normal commit diff semantics; do not sum parent diffs separately.
- Keep line statistics on each commit reference because one root run can contain commits from different worktrees. Do not derive a shared repository from the history entry.
- Add an action-scoped usage aggregator beside the existing card/project token aggregators. It filters conversations by action and card before calling `sumAgentTokenUsage`.
- Build both compact labels from already-loaded conversations and action history. Opening a tooltip must not reread agent logs or rerun Git.

## Persisted-history compatibility

F_056 history entries created before this feature have `commits[]` without short-stat fields. Before implementation, choose either a one-time migration that resolves and writes the missing statistics or intentional removal of the line summary for those runs. Do not silently display a partial total and do not add an implicit dual-schema fallback.

## Edge cases

- No commits for the current action/card: omit the line label and its tooltip.
- Commits exist but add and delete no text, for example a metadata-only change: show `lines: 0`.
- Binary-only changes can increase `filesChanged` while insertions and deletions remain zero.
- Several chain actions commit in one root run: count every deduplicated `CommitReference` once, preserving F_056 ownership and ordering.
- Failed or cancelled runs retain and count commits completed before termination, as defined by F_056.
- A conversation without usage contributes zero. Missing cost remains absent rather than displaying `$0`.
- Malformed or negative persisted statistics fail history validation clearly; they must not become `NaN` or be coerced to zero.
- If Git cannot resolve short-stat metadata while capturing a new commit, history recording fails under the existing F_056 metadata rule rather than persisting an incomplete reference.

## Acceptance criteria

- Token summaries show only `tokens: <total>` inline; their tooltip contains the complete token breakdown and optional reported cost.
- Card, project, current-version, and release token totals remain numerically identical to F_054.
- An agent action popup for a card sums tokens only from conversations matching that action and card.
- The same popup shows `lines: <total>` only when its loaded action/card history contains commits.
- The line total equals the sum of Git-reported insertions and deletions across all commits owned by those root runs.
- The line tooltip shows aggregate files/insertions/deletions and per-commit short hash, insertions, and deletions.
- Commits made by linked actions count under the root action that owns them; they do not appear when opening the linked action independently unless it has root runs of its own.
- Tests cover compact token rendering and tooltip access, action/card token filtering, no-commit hiding, zero-line and binary commits, multiple commits and worktrees, failed/cancelled runs, root commits, and short-stat parsing.
- Existing F_054 and F_056 aggregation, ownership, ordering, commit dropdown, and diff tests continue to pass.

## See also

- `design/feature_descriptions/F_054_agent_token_usage_tracking.md`
- `design/feature_descriptions/F_056_root_action_commit_history.md`
- `app/src/services/agent_usage.ts`
- `app/src/components/actions/use_action_popup_controller.ts`
- `desktop/src/actions/action_run_history.js`
- `desktop/src/git/git_commands.js`
