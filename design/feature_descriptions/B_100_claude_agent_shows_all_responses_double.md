---
author: 
id: B_100
internalId: dda2ae5a-d265-4134-93ab-268b664cb1ae
title: claude agent shows all responses double
status: design
owner: 
affects:
agents:
  - design/activity/card__dda2ae5a-d265-4134-93ab-268b664cb1ae.json#conversation=agent-3ab3367c-b2f1-4230-8beb-2aa055754784
policy:
---
When an action is run by the claude agent, all responses, accept the last one he gives are shown 2 times in the chatlog. so 2 identical bubbles below each other.

something is going wrong here. this is not happening with the codex agent.

## Current state

Confirmed reproduction: conversation `agent-793ef4cc-80b6-453e-a264-fc5869fdf065` in `design/activity/card__05d5d49c-401f-42cd-b3cc-074e169631dd.json`. Every Claude assistant text is stored as **two separate `message` entries** with consecutive ids (`…-turn-1-assistant-1` and `…-turn-1-assistant-2`, `…-assistant-3` and `…-assistant-4`, and so on). The two copies hold the same text, differing only in a leading paragraph separator: the first copy keeps the `\n\n` that separates it from the previous message, the second copy has it stripped. The final assistant message is stored only once. So N assistant steps produce `2·(N−1)+1` bubbles.

"Streaming" here means the desktop runs Claude with `--include-partial-messages` (see `agent_profiles.mjs` / `agent_profiles.test.mjs`): Claude emits each assistant step **twice on the wire** — first as incremental partials (`stream_event` → `message_start`, `content_block_start`, `content_block_delta`), then as one aggregated `assistant` message carrying the whole step. `ClaudeStreamingAdapter` in `desktop/src/actions/agent/agent_claude_streaming_adapter.js` is meant to fold the aggregated copy back onto the streamed copy so only one bubble results.

Reconciliation is keyed by `providerItemId`. The streamed text block is keyed `${activeMessageId}:text:${index}` in `handleContentBlockStart`; the aggregated block is keyed `${messageId}:text:${index}` in `handleAssistantCompletion`, and the streamed block is looked up by content-array `index` in `this.activeBlocks`. Downstream, `agent_run_transcript.js#startAssistantItem` turns each `assistantStarted` event into a **new** `message` entry (`${run.id}-turn-${turnIndex}-assistant-${assistantItemIndex}`), while `replaceAssistantOutput` updates an existing one in place. The app mirrors this in `action_run_registry.ts#appendAssistantMessage` (new `messageId` ⇒ new bubble). Codex has no partial-vs-aggregated duplication (single item stream), so it is unaffected.

## Implementation details

Causal chain of the bug, in `handleAssistantCompletion` (`agent_claude_streaming_adapter.js`):

- When the aggregated `assistant` message for a step arrives, the method should find the already-streamed block and emit `assistantCompleted`, which routes to `replaceAssistantOutput` and rewrites the existing bubble in place (no-op when text is identical).
- Instead the guard `if (!trackedBlock || trackedBlock.providerItemId !== providerItemId)` takes the miss branch and emits a fresh `assistantStarted`, which `startAssistantItem` turns into a **second** `message` entry holding the same text — the duplicate bubble.
- The miss is provable from the stored data: the duplicate copy has an empty separator, and `separator = trackedBlock?.separator ?? (this.turnHasAssistantText ? '\n\n' : '')` can only yield `''` when `trackedBlock` is `undefined`. `this.activeBlocks` is cleared on every `message_start`, so by the time an earlier step's aggregated `assistant` message is handled the adapter has already advanced past it (its block map entry is gone) and the key lookup misses.
- The final step is the exception: nothing advances past it before its aggregated `assistant` message lands, so its block is still tracked, the key matches, and it replaces in place — one bubble.

Fix direction (choose one; keep both provider paths symmetric per the file's shared-decoder note):

- Make the aggregated `assistant` message reconcile against the streamed step reliably — e.g. track streamed text items by a stable per-step key (Claude message id + block index) that does not depend on `activeBlocks` still holding the block, so a late aggregated message updates the existing entry instead of starting a new one.
- Or suppress the aggregated text re-emit entirely when the step was already streamed via partials, emitting `assistantCompleted` only to finalize the existing item and never a second `assistantStarted`.
- Preserve the existing paragraph separator on whichever single entry survives.

Add coverage in `agent_streaming_adapter.test.mjs` for the interleaving that reproduces this: partial stream of step A, then `message_start` of step B (clearing `activeBlocks`), then the aggregated `assistant` message for A — assert A yields exactly one assistant item.

## Acceptance criteria

- Running a Claude action produces exactly one chatlog bubble per assistant step; no step (except formerly the last) is duplicated.
- Each stored conversation contains one `message` entry per assistant step — no consecutive assistant entries with identical text.
- The surviving bubble keeps its correct paragraph separation from the preceding message (no lost or doubled `\n\n`).
- Streaming (partial-message) and non-streaming Claude runs both yield single bubbles.
- Codex runs are unchanged (still single bubbles).
- A regression test reproduces the partial-then-aggregated interleaving and asserts a single assistant item per step.