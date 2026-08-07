---
author: 
id: F_154
internalId: a2cf4f9a-dc7f-417e-8591-c5993e770738
title: claude protocol diagnostics
status: ready
owner: 
affects:
agents:
  - design/activity/card__a2cf4f9a-dc7f-417e-8591-c5993e770738.json#conversation=agent-093c5dad-a779-4aaf-9a67-304170e1ec22
  - design/activity/card__a2cf4f9a-dc7f-417e-8591-c5993e770738.json#conversation=agent-8fa59c40-e1dc-4209-9717-36fb7d701839
policy:
---

when talking to the claude agent, we get a lot of 'claude protocol diagnostics' blocks. I think the can be hidden, they show no real value?

## Current state

`ClaudeStreamingAdapter.emitDiagnostic()` fires for any Claude SDK event the adapter does not recognise (`agent_claude_streaming_adapter.js:416`). It always emits a `type: 'diagnostic'`, `status: 'completed'` conversation event with the label "Claude protocol diagnostic." Both routine protocol traffic (non-`init` system events such as rate-limit notifications, unknown stream event subtypes introduced in newer SDK versions) and actual protocol errors (missing required fields, structurally invalid data) go through the same path and produce identical, visible, collapsible blocks in the chat UI.

`normalizeConversationContext` already excludes `type: 'diagnostic'` entries from the context sent back to agents (`agent_transcript.js:50` — `diagnostic` matches none of the included types). The UI filter in `visibleConversationGroups` (`action_conversation_chat.tsx:33`) does not exclude them, so all stored diagnostic events render.

## Implementation details

Two categories of diagnostic need different treatment:

**Routine protocol noise** — non-`init` system events, and unrecognised event/stream-event/content-delta types introduced by Claude SDK evolution. The adapter has no handler, but the data is structurally valid. Suppress silently: no event emitted, nothing shown to the user.

**Protocol errors** — required structural fields absent or wrong type: `message_start` without `message.id`, invalid `content_block_start` (missing index, block, or active message), invalid `content_block_delta` (missing tracked block or delta type), `assistant` message missing `content` array. These mean the adapter received data it cannot process. Emit as `type: 'error'`, `status: 'failed'` using the existing error event path, so they render with error styling and are included as `[Failure]` in `normalizeConversationContext`.

Concretely:
- Split `emitDiagnostic` in `agent_claude_streaming_adapter.js` into two methods: one that drops silently (noise), one that emits `type: 'error'` / `status: 'failed'` (protocol errors).
- Add `entry.type !== 'diagnostic'` to the `visibleConversationGroups` filter in `action_conversation_chat.tsx` to suppress old persisted diagnostic events from rendering.
- `agent_codex_event.js` `diagnosticEvent` and its callers are out of scope (separate adapter, separate feature).

## Acceptance criteria

1. Conversing with the Claude agent under normal conditions produces zero "Claude protocol diagnostic" blocks in the chat UI.
2. A protocol error during streaming (e.g., `message_start` event with no `message.id`) surfaces as a red error-styled block in the chat UI — not as a "Claude protocol diagnostic" block.
3. Old persisted conversations that contain stored `type: 'diagnostic'` entries do not render those entries in the chat UI.
4. `normalizeConversationContext` behaviour is unchanged: `diagnostic` entries excluded, `error` entries included as `[Failure]`.
