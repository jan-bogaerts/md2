---
author: 
id: B_309
internalId: d83805df-4700-49e0-b4af-5d29ee542ce4
title: claude questions block conversation log
status: ready
owner: 
affects:
agents:
  - design/activity/card__d83805df-4700-49e0-b4af-5d29ee542ce4.json
policy:
after: 844f1b00-159f-43e2-a2d1-2c6cb40ec39b
---

When claude asked a question and we answered, the conversation log stops showing any next messages. it seems the conversation log is in an incorrect state

## Current state

* `AgentRunnerService` owns the canonical `AgentConversation.entries` array. Streaming assistant and provider-event updates carry their exact backend `entryIndex`; `ActionRunRegistry` applies each update at that index and rejects an identity or sequence mismatch.
* Since commit `0d18f34d7e5326d915637f74187e8342cd80df1a` on 2026-09-06, `handleQuestion` appends an `agentQuestion` event to the backend conversation. This entry persists the pending questions so they can be restored after restart.
* The live question notification does not send that transcript entry. `ActionRun` publishes an `agentQuestion` update containing only questions and request id, and `ActionRunRegistry` only sets the question box. Its live conversation therefore becomes one entry shorter than the backend conversation.
* Answering appends the answer message on both sides but does not repair that offset. The next backend `agentOutput` index is one greater than the renderer's append position. `updateAgentOutputAtIndex` rejects it; since commit `2cc2a439d06756c778e8c6bfaa19f05a27987d5c` on 2026-10-08, the registry catches the error, logs `[action:agentOutput]`, and drops the conversation update. Every later indexed update remains offset, so the live conversation appears frozen while Claude and the backend continue.
* `ActionConversationChatlogTracker` already hides `agentQuestion` transcript events because the question box is their visible UI. Keeping the hidden entry in the live conversation will preserve index alignment without adding a duplicate row.
* Claude's streamed and aggregated text reconciliation already has focused `AskUserQuestion` coverage. It is not the failing layer.

## implementation details

* Change `appendQuestionEntry` in `agent_streaming_event_handlers.js` to return the created event and its index after appending it to `run.conversation.entries`.
* For a newly received live question, keep checkpoint persistence first. After persistence succeeds, emit the returned entry through the existing `{ entryIndex, event, type: 'agentEvent' }` path before publishing the `question` update. `ActionRun` and `ActionRunRegistry` already forward and apply this granular transcript update; no new update type is needed.
* Do not emit another transcript entry when `handleSessionReady` restores a pending question. The `agentStarted` conversation snapshot already contains its persisted `agentQuestion` entry; `sessionReady` should only restore the question box.
* Keep `conversationEventIsVisible` unchanged so `agentQuestion` remains hidden from the transcript. Keep strict index, message identity, and sequence validation unchanged; they correctly expose backend-renderer divergence.
* This uses the generic agent-question path and therefore fixes any provider that sends a structured live question, including Claude. Do not change Claude stream correlation, answer submission, dismissal, status transitions, or conversation identity.
* Add `agent_runner_state.test.mjs` coverage asserting that a new question emits one indexed `agentEvent` matching the entry persisted in the backend conversation.
* Add `action_run_registry.node.test.ts` regression sequences for question then answer then assistant output, and question then dismissal then assistant output. Assert backend indexes append successfully and later messages remain in the live conversation.
* Keep or extend chatlog tracker coverage proving `agentQuestion` exists in canonical entries but renders no transcript row. Add restored-question coverage proving `sessionReady` does not duplicate the entry.

## acceptance criteria

* Backend and live renderer conversations contain the same ordered entries and indexes throughout a live question, answer, or dismissal.
* After a user answers or dismisses a live Claude question, every later assistant message and provider event appears immediately in the conversation log in backend order.
* The canonical live conversation contains exactly one `agentQuestion` event for each question request, but the conversation transcript shows no extra question row.
* Restarting with a persisted pending question restores the question box without duplicating its `agentQuestion` entry.
* Index, message identity, and sequence mismatches remain rejected and logged; the fix does not translate indexes or add compatibility offsets.
* Existing non-question output, Claude aggregate reconciliation, Codex questions, approvals, queued prompts, and persisted conversation behavior remain unchanged.
