---
author: 
id: F_163
internalId: 425e518f-0813-4f49-a459-62f73a7c0655
title: unify action usage summary scopes
status: ready
owner: 
affects:
agents:
  - design/activity/card__425e518f-0813-4f49-a459-62f73a7c0655.json#conversation=agent-24249c93-8e7f-4211-b50c-58c4623de5e5
policy:
branch: f_163_unify_action_usage_summary_scopes
worktree: 1
---

# Goal

Make `tokens`, `changes`, and `lines` in the card action popup use one explicit, user-selectable scope.

# Current state

`ActionUsageSummary` mixes scopes: tokens cover all loaded conversations for the action/card, changes cover only the displayed live or selected conversation, and lines cover commits from all runs in the action/card history. The labels do not explain this difference.

# Behavior

- Support two scopes:
  - **Conversation:** the displayed live or selected conversation. Match committed lines through the history entry whose `rootConversationId` equals the conversation id.
  - **Action/card:** all conversations and root-run history for the current action and card.
- Use action/card scope by default. A conversation selection change updates the conversation-scope values without changing the active scope.
- Always render all three values. Missing usage, file-change events, or commits count as zero for that metric and scope.
- Clicking any value toggles the shared scope and updates all three values together. Never allow different metrics to show different scopes.
- Render each value as a clearly interactive text control with pointer cursor, hover and keyboard-focus styling, and button semantics. Its accessible name includes the metric and active scope.
- Each metric has a tooltip that:
  - briefly defines the metric;
  - identifies the active scope and explains that clicking switches scope;
  - shows both the conversation and action/card values, marking the active one.
- `tokens` means cumulative provider token usage. `changes` means additions and deletions across completed provider file-change patches. `lines` means additions plus deletions in captured Git commit diffs.
- Keep the existing commit/file breakdown in the lines tooltip after the scope values, limited to commits in the active scope.
- When no conversation is displayed, use action/card scope and show conversation values as unavailable; do not toggle to an unavailable scope.

# Implementation

- Add one popup-bound usage-scope store beside the existing conversation and history stores; `ActionUsageSummaryOwner` subscribes with `useSyncExternalStore`.
- Add scoped aggregators for token usage, provider file changes, and commit line usage. Include the live conversation in action/card totals once, deduplicated by conversation id.
- Derive conversation commits from `AgentActionRunHistoryEntry.rootConversationId`; do not infer ownership from timestamps or commit paths.
- Update `ActionUsageSummary`, its owner, popup bindings, and focused tests. No persistence or Electron bridge changes are required.

# Acceptance criteria

- Tokens, changes, and lines always display the same active scope and switch together when any value is clicked or keyboard-activated.
- Every value visibly appears interactive and its tooltip explains the metric, switching behavior, and both scope values.
- Conversation scope uses only the displayed conversation and its matching commits; action/card scope includes every matching conversation and root run without double-counting the live conversation.
- Zero and unavailable states, live updates, conversation switching, commit matching, tooltips, pointer interaction, and keyboard interaction are covered by tests.
