---
author: 
id: B_155
internalId: cc4accfc-c35f-4613-8407-108c00d0a0dd
title: claude context window size missing
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__cc4accfc-c35f-4613-8407-108c00d0a0dd.json
policy:
---

we get the context window from codex already, claude should have something similar, but we don't appear to show the used context size. this needs to be fixed.

## Current state

`ClaudeStreamingAdapter` emits Claude's cumulative token usage from each `result` event, but never requests Claude's current context usage. Its `turnCompleted` event therefore has no `contextWindowUsage`.

The remaining path already supports both providers. `agent_streaming_event_handlers.js` stores `contextWindowUsage` on `AgentConversation`, `shared/agent_conversations.mjs` validates and restores it, and `ActionConversationChat` displays it through the existing context indicator. With no Claude snapshot, that indicator stays hidden.

Claude's billing usage is not a context snapshot: it can aggregate several model calls during one turn. Claude's `get_context_usage` control request instead returns `totalTokens`, the tokens currently in context, and `maxTokens`, the effective limit after Claude's auto-compaction reserve.

## implementation details

- Extend `ClaudeStreamingAdapter` with one correlated outgoing control request for `{ subtype: 'get_context_usage' }` after each successful Claude `result` event. Keep incoming approval and question control requests unchanged.
- Delay that turn's `turnCompleted` event until matching `control_response` arrives or a short named timeout expires. This ensures context snapshot and turn token usage reach existing completion, persistence, and renderer paths together. Ignore late or unrelated responses.
- Validate `totalTokens` as a non-negative safe integer and `maxTokens` as a positive safe integer. Map valid data to `{ usedTokens: totalTokens, capacityTokens: maxTokens }`. Do not use `rawMaxTokens`, Claude billing counters, model lookup tables, or configured defaults.
- Include mapped snapshot in existing `turnCompleted` event. A malformed, error, unsupported, or timed-out context response must not fail an otherwise successful Claude turn; send `contextWindowUsage: null` so stale context data is removed and indicator stays hidden.
- Keep non-streaming Claude runs unchanged because their one-shot protocol has no persistent bidirectional control channel. No conversation schema, shared persistence, renderer service, or component change is required.
- Add adapter tests for request shape and correlation, valid mapping, replacement on later turns, malformed/error response, timeout, late response, and unchanged Claude usage accounting. Run affected desktop unit tests and lint.

## acceptance criteria

- After a successful streaming Claude turn, adapter sends one `get_context_usage` control request and correlates only its matching response.
- A response with `totalTokens: 42_000` and `maxTokens: 258_400` stores `{ usedTokens: 42_000, capacityTokens: 258_400 }`; existing UI shows `16%` for that conversation.
- Continuing same Claude conversation replaces previous snapshot after each successful turn. Snapshot remains available after conversation save and reload.
- Claude turn token totals remain cumulative and unchanged; context tokens are latest occupancy, not added to token totals.
- Missing, zero, negative, non-integer, or otherwise malformed context values clear snapshot and never produce `NaN`, `Infinity`, or fabricated capacity.
- Context request error, unsupported response, or timeout leaves successful Claude turn successful and completes normal persistence and waiting-for-input transition. Late response cannot overwrite newer turn state.
- Codex context reporting, incoming Claude approvals/questions, and non-streaming Claude runs keep current behavior.
