---
author: 
id: B_309
internalId: d83805df-4700-49e0-b4af-5d29ee542ce4
title: claude questions block conversation log
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__d83805df-4700-49e0-b4af-5d29ee542ce4.json
policy:
---

When claude asked a question and we answered, the conversation log stops showing any next messages. it seems the conversation log is in an incorrect state

## Current state

* Claude sends assistant text twice: first as incremental `stream_event` frames, then as an authoritative aggregated `assistant` frame containing the complete message.
* `AskUserQuestion` pauses that stream. After the answer, Claude can re-deliver the pre-question aggregate and begin another message. Thinking or tool blocks can also change the text block's array index between streamed and aggregated forms.
* Conversation output is updated by stable assistant-item identity. `AgentRunnerService` maps that identity to one transcript entry, and `ActionRunRegistry` applies the resulting indexed update to the live conversation shown by `ActionConversationChatlogTracker`.
* If the Claude adapter loses or changes a text item's identity across the pause, it starts or replaces the wrong transcript entry. Later indexed updates then fail identity or ordering checks, so Claude continues but the visible conversation stops receiving new messages.

## implementation details

* In `agent_claude_streaming_adapter.js`, identify each text item by Claude message id plus its ordinal among text blocks, not by the block's array index. A text ordinal is its zero-based position among text blocks only; thinking and tool blocks do not affect it. Namespace sub-agent items by their stream key.
* Keep root assistant text-item metadata for the whole turn, including its paragraph separator. Do not clear it when the next Claude message starts or when a question is answered. Clear it only when the root `result` ends the turn.
* Emit `assistantStarted` once per text-item identity. Reconcile every aggregated copy through `assistantCompleted`: replace the matching streamed entry, create one entry when no streamed copy exists, and treat repeated aggregates as updates to that same entry.
* Keep question submission, persisted `agentQuestion` and answer entries, conversation status transitions, and renderer grouping unchanged. This fix concerns Claude output correlation, not question lifecycle or conversation identity.
* Add a regression sequence to `agent_streaming_adapter.test.mjs`: stream text, receive `AskUserQuestion`, answer it, re-deliver the earlier aggregate with a shifted text-block index, then deliver later assistant text. Assert one transcript item per Claude text item and continued output after the answer. Cover repeated aggregates and an aggregate-only post-question message.
* Add focused runner coverage proving reconciled items retain distinct transcript indexes and a later item remains appendable after an earlier item is finalized. Existing non-question Claude, Codex, sub-agent, approval, and persisted-question behavior must remain unchanged.

## acceptance criteria

* After a user answers a live Claude question, the conversation log immediately shows the answer and every later Claude message in provider order.
* Pre-question assistant text appears once. Re-delivered Claude aggregates update that text without duplicating it or replacing a later message.
* Thinking or tool blocks before a text block do not change which transcript entry receives the completed text.
* Multiple questions in one turn and repeated aggregated frames do not stop, duplicate, or reorder later conversation output.
* Finishing the turn clears correlation state; output from a later turn cannot update entries from the previous turn.
