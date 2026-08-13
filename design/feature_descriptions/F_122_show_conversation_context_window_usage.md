---
author: 
id: F_122
internalId: 528ea430-ce5c-4e61-ac31-70c93daf5eaa
title: show conversation context-window usage
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__528ea430-ce5c-4e61-ac31-70c93daf5eaa.json#conversation=agent-3cc024e7-0ddd-49f7-850c-67de72b788e3
policy:
---

Show the percentage of the selected conversation's context window that is used in the action popup, beside the existing total-token usage at the left of the bottom action row.

# Current state

The Codex App Server emits `thread/tokenUsage/updated` with the latest request usage in `tokenUsage.last` and the effective capacity in `tokenUsage.modelContextWindow`. `agent_streaming_adapter.js` keeps the latest token counters but discards the context-window capacity. The runner then accumulates those counters into `AgentConversation.usage`, which is suitable for total usage but cannot represent current context occupancy.

`ActionUsageSummary` displays aggregate token usage for the action and card in `ActionPopupBottomRow`. The popup already exposes `controller.displayedConversation`, but the summary does not receive it.

# Implementation details

- Preserve a separate latest context-window snapshot on Codex conversations: `usedTokens` from `tokenUsage.last.totalTokens` and `capacityTokens` from `tokenUsage.modelContextWindow`. Do not add these values to cumulative `AgentTokenUsage` or its shared aggregation helpers.
- Carry the snapshot through the streaming adapter, turn-completion event, conversation runner, canonical conversation persistence/parser, and `AgentConversation` type. Replace it on each completed Codex turn instead of accumulating it.
- Calculate `usedPercent = min(100, usedTokens / capacityTokens * 100)` and display it as a whole-number percentage. Do not use `tokenUsage.total.totalTokens`, a model lookup table, or a configured context-window fallback.
- Pass `controller.displayedConversation` to `ActionUsageSummary` and render the percentage beside `AgentUsageDisplay`, using the same caption styling and bottom-row location as the existing token total.
- Hide the percentage until the selected conversation has a valid snapshot. Existing conversations and non-Codex providers therefore keep the current token display without a fabricated percentage.
- A newly reported capacity replaces the previous capacity so model rerouting and compaction are reflected by later usage notifications.

# Affected components

- `desktop/src/actions/agent/agent_streaming_adapter.js`: retain the App Server context snapshot.
- `desktop/src/actions/agent/agent_runner_service.js` and `desktop/src/actions/agent/agent_conversation.js`: attach the latest snapshot without changing cumulative token accounting.
- `shared/agent_conversations.mjs` and `app/src/data/data_types.ts`: validate and expose the persisted snapshot.
- `app/src/components/actions/action_popup_bottom_row.tsx` and `action_usage_summary.tsx`: show the selected conversation's percentage beside total tokens.

# Acceptance criteria

- A selected Codex conversation with `last.totalTokens = 42,000` and `modelContextWindow = 258,400` shows `context: 16%` beside its existing token total.
- The percentage uses the displayed conversation only; switching conversations updates or hides it accordingly.
- Continuing a conversation replaces its context snapshot after each completed turn while its existing total-token counter remains cumulative.
- Values above the effective capacity display `100%`; a missing, zero, negative, or malformed capacity does not produce `NaN`, `Infinity`, or a fabricated model default.
- The last known percentage remains available after saving and reloading a conversation that contains a valid snapshot.
- Adapter, persistence, calculation, popup-summary, conversation-switching, and unavailable-data behavior are covered by tests.
