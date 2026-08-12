---
author: 
id: F_147
internalId: bbf61e6e-adfa-46ee-a2f4-040b8152bc4b
title: Live update token usage action popup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__bbf61e6e-adfa-46ee-a2f4-040b8152bc4b.json#conversation=agent-c01532cd-fbfc-4d1a-96d7-523ff80faab0
policy:
---
To investigate: i think token count on action popup is only at end of conversation updated. I think we can do better and update it while the agent is still running.

## Current state

`ActionUsageSummaryOwner` reads `AgentConversation.usage` from live action-run state. `ActionUsageSummary` then shows that cumulative total for selected conversation or action/card scope.

Codex App Server emits `thread/tokenUsage/updated` during active turn, but `agent_streaming_adapter.js` only stores latest value in `turnUsage`. `agent_streaming_event_handlers.js` adds that value to conversation after turn completes, then emits status change without updated usage. Renderer therefore receives new usage only with final `agentClosed` conversation when process exits. Claude reports usage in final result for each turn, so Claude cannot update before provider completes turn.

## Implementation details

- Define **live token usage** as latest normalized provider usage received while action run remains active. Do not estimate usage from streamed text and do not poll.
- Forward each Codex `thread/tokenUsage/updated` value through streaming adapter and agent runner. For providers that report usage only at turn completion, forward value then while conversation can still remain open for next user message.
- Publish cumulative conversation snapshot: completed previous-turn usage plus latest current-turn usage. Keep current-turn snapshot separate from persisted cumulative total until turn completes, preventing repeated provider notifications from being counted more than once.
- Add focused usage update to agent-run event contract and map it through `ActionRun` into `ActionRunUpdate`. In `ActionRunRegistry`, replace live conversation `usage` immutably so `useActionRunSelector` notifies `ActionUsageSummaryOwner` while preserving entries, status, approvals, and other run state.
- Reuse existing `ActionUsageSummary` aggregation and conversation/action-card scope behavior. Do not add timer, compatibility flag, provider estimate, or new popup-owned application state.
- Ignore absent usage. Existing normalization remains authority for malformed counters. Final persisted conversation and live total must match after same turn completes.

## Acceptance criteria

- During active Codex turn, each valid `thread/tokenUsage/updated` notification updates popup token total without waiting for turn completion, agent finish, popup reopen, or project reload.
- Conversation scope shows completed previous-turn usage plus latest current-turn snapshot. Repeated snapshots for same turn replace current-turn contribution instead of accumulating it again.
- Action/card scope includes live conversation update once and keeps totals from other matching conversations.
- When provider reports usage only at turn completion, popup updates at that point even if conversation remains open and waits for next user message.
- Missing usage leaves displayed total unchanged. No total becomes `NaN`, negative, or fabricated from streamed text.
- Final live total equals persisted total after successful turn completion. Cancellation or failure does not persist unconfirmed current-turn usage unless provider supplied it as completed-turn usage.
- Focused tests cover provider event forwarding, cumulative snapshot calculation, action-run event mapping, immutable registry update, both popup scopes, repeated snapshots, missing usage, and final-total consistency.
