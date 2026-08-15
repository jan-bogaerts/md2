---
author: 
id: B_117
internalId: 16e415b8-8ab2-4050-bb45-c6c37c0c3465
title: claude agent answers still duplicated
status: ready
owner: 
affects:
agents:
  - design/activity/card__16e415b8-8ab2-4050-bb45-c6c37c0c3465.json#conversation=agent-9a54b06c-2a09-4849-a51d-c71282417288
  - design/activity/card__16e415b8-8ab2-4050-bb45-c6c37c0c3465.json#conversation=agent-3a3c03e7-9cbe-4e41-a9ff-93ce3b6bcbc0
policy:
after: 8355401d-f3b6-4285-a21d-8ec6ed389215
---
we had this before with the claude agent, with responses coming from claude. seems we still have the same issue with `answers` and regular responses. so this has not been fixed at all

## Current state

The B_100 fix (ticket `B_100_claude_agent_shows_all_responses_double`) added a reconciliation map, `streamedTextItems`, to `desktop/src/actions/agent/agent_claude_streaming_adapter.js`. It removed the plain-turn duplication but does **not** cover the `AskUserQuestion` answer flow. ("Answer" here = the reply the user sends back to Claude's `AskUserQuestion` tool; the desktop records it as a `…-answer-N` user entry in the conversation.)

Reproduction: conversation `agent-turn-a03fcee4-…` in `design/activity/card__8a177e01-b5d4-46aa-b42f-9ba11f561b60.json`. Claude asks an `AskUserQuestion`, the user answers, Claude continues — and the assistant text on **both sides of the answer** is stored twice, as two consecutive `message` entries with the same text:

- `…-turn-1-assistant-1` — "Read the design + full codex reference path…" (no leading separator)
- `…-turn-1-assistant-2` — same text, prefixed with `\n\n` — immediately before the `AskUserQuestion` tool event
- (user `…-answer-34`)
- `…-turn-1-assistant-3` — "…Answers: **spec both…**. Writing now." (prefixed `\n\n`)
- `…-turn-1-assistant-4` — same text, also prefixed `\n\n`

So each affected assistant step renders as **two identical chat bubbles** ("bubble" = one rendered assistant `message` entry in the chatlog). The final step of the turn (`assistant-5`) is stored once. A plain Claude turn with no `AskUserQuestion` (e.g. `card__dffba4e6-…`) shows single bubbles, which is why this reads as "answers" specifically.

Terminology used below:
- **streamed (partial) copy** — assistant text delivered incrementally while `--include-partial-messages` is on: `stream_event` → `content_block_start`/`content_block_delta`.
- **aggregated copy** — the same step re-sent once as a whole in a single `type: "assistant"` message.
- **reconciliation** — folding the aggregated copy onto the streamed copy so only one bubble results, keyed by `providerItemId`.

## Implementation details

Same failure class as B_100: the aggregated `assistant` text block for a step is **not** matched to the text already shown for that step, so `handleAssistantCompletion` takes its miss branch and starts a fresh item, which `agent_run_transcript.js#startAssistantItem` turns into a **second** `message` entry — the duplicate bubble.

Causal chain (`agent_claude_streaming_adapter.js#handleAssistantCompletion`, lines ~356–366):

* For each aggregated text block it computes `providerItemId = block.id ?? \`${messageId}:${block.type}:${index}\`` and looks it up in `streamedTextItems`.
* On a hit it emits `assistantCompleted` → `replaceAssistantOutput`, rewriting the existing bubble in place (correct, single bubble).
* On a **miss** (`!streamedItem`) it emits a fresh `assistantStarted` + `assistantCompleted`, producing a new bubble. The separator proves the miss: the duplicate copies carry the fallback `separator = this.turnHasAssistantText ? '\n\n' : ''`, which is only reachable when `streamedItem` is `undefined` — matching the observed `\n\n`-prefixed second copies.

Two contributing gaps, both anchored in current code:

1. **Key does not survive the question pause.** The reconciliation key embeds the Claude message id and the block index (`${messageId}:text:${index}`). Across the `AskUserQuestion` pause/resume the key stored while streaming and the key computed for the aggregated copy diverge, so the lookup misses. The exact drift (message-id change, block-index shift, or a re-delivered aggregated message) is the one item to confirm against the raw event stream during implementation — see Open question.
2. **The miss branch never records what it creates.** When `handleAssistantCompletion` falls into `!streamedItem` and starts a new bubble, it does **not** add that item to `streamedTextItems`. So any *repeat* aggregated delivery of the same step misses again and duplicates again. This gap is provable from the code alone, independent of gap 1.

The final step escapes for the same reason as B_100: nothing advances past it or re-delivers it before the turn's `result` clears state, so it stays reconciled to one bubble.

Fix direction (keep it minimal, in the adapter):
* Record every assistant text item the adapter emits — streamed **or** aggregated — under a key that is stable across the `AskUserQuestion` pause/resume and independent of block index, so a later aggregated copy (or a re-delivery) updates the existing bubble in place instead of starting a new one. This closes both gaps at once.

Add coverage in `agent_streaming_adapter.test.mjs` (or the Claude adapter test): stream step A's text, emit an `AskUserQuestion` request, feed an answer, then deliver A's aggregated `assistant` message and B's aggregated text after the answer — assert each step yields exactly one assistant item.

## Open question

Confirm against a captured Claude event stream which key drift causes the miss in the answer flow (changed message id vs shifted block index vs a second aggregated delivery of the same step). The fix above is written to cover all three, but the regression test should reproduce the actual ordering.

## Acceptance criteria

* A Claude turn that includes an `AskUserQuestion` produces exactly one chatlog bubble per assistant step, before and after the answer — no step is duplicated.
* Each stored conversation holds one `message` entry per assistant step: no consecutive assistant entries with identical text around a `…-answer-` entry.
* The surviving bubble keeps correct paragraph separation from the preceding message (no lost or doubled `\n\n`).
* Plain Claude turns (no `AskUserQuestion`) and Codex turns remain single-bubble (no regression).
* A regression test reproduces the streamed-then-answered-then-aggregated interleaving and asserts a single assistant item per step.