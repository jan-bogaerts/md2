---
author: 
id: B_266
internalId: 5785f8fc-1509-47f0-8b60-5b34f03774c1
title: after queued message chatlog stops responding
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__5785f8fc-1509-47f0-8b60-5b34f03774c1.json
policy:
branch: b_266_after_queued_message_chatlog_stops_responding
worktree: 3
---

Something strange going on with the chatlog of the active conversation on the action-popup.

after sending a queued message (so a new input while the agent was still doing something so that the message first appears as 'queued'), all output that the agent still sends, is no longer shown on the chatlog.

only after the user clicks on the 'finish conversation' button and the chatlog reloads again, are the messages shown again that the agent sent after the queued message.

this is a but that needs fixing. Now, we already did a few other fixes since, so we need to check if the bug is still valid.

## Current state

Bug still valid. Cause: desktop emits the `userMessage` event too late, so the renderer receives agent events whose `entryIndex` points past the end of its conversation copy.

Terms:

* `entryIndex`: position of an entry in `conversation.entries`. Desktop and renderer each hold a copy of the entries; index-based updates only work while both copies have the same length and order.
* checkpoint: `service.persistCheckpoint(run)`, an async file write of the running conversation.

Causal chain for a queued prompt (`desktop/src/actions/action/action_run.js`, `dispatchStreamingPrompt`):

1. Agent reaches `waitingForInput`; `dispatchStreamingPrompt` takes the queued entry, publishes `agentPromptDispatched`, calls `agentRunnerService.sendMessage`.
2. `sendStreamingMessage` in `desktop/src/actions/agent/agent_run_interactions.js`:
   1. writes the prompt to the agent (`streamingAdapter.sendMessage`);
   2. pushes the user message into desktop `run.conversation.entries` at index `k`;
   3. `await service.persistCheckpoint(run)`;
   4. only then emits `userMessage`, then `state`.
3. During step 2.3 the agent already answers. `agent_provider_event.js` and `agent_run_transcript.js` push each provider event / assistant output at index `k+1`, `k+2`, … and emit it immediately as `agentEvent` / `agentOutput`.
4. Renderer `ActionRunRegistry.handleEvent` (`app/src/services/actions/action_run_registry.ts`) receives `agentEvent` with `entryIndex = k+1` while its entries length is `k`. `requireEntryIndex` throws `Conversation entry index out of range`. The event sequence is already recorded, so the event is lost; the run store is not updated.
5. `userMessage` arrives and is appended at renderer index `k`. From here on every later index-based update either targets the wrong entry (identity mismatch → throw) or is out of range (→ throw). Nothing catches the exception: `handleEvent` → `handleIncomingEvent` → `onActionRun` listener in `desktop/src/shell/preload.js` `subscribeBridge` → `ipcRenderer` event emitter. It ends as an uncaught error in the renderer DevTools console only (app has no global `error` handler). No dialog, chatlog freezes.
6. Finish conversation → `agentClosed` sends the full conversation with `conversationChange: { kind: 'replace' }` → chatlog shows all entries again.

The race exists for every streaming `sendMessage` (queued or direct). It shows mostly with queued prompts because they are dispatched the moment the agent turn ends and the agent answers fast.

Not affected: first prompt (`agent_runner_service.js` `start` emits `started` + `userMessage` without awaiting in between).

Same race, same file: `answerQuestion` pushes the answer user message, `dismissQuestions` pushes a `questionsDismissed` event entry; both `await persistCheckpoint` before emitting `questionAnswered` / `questionDismissed`. Renderer appends those entries at `entries.length` on `agentQuestionAnswer` / `agentQuestionDismissed`, so agent output emitted during the wait breaks the chatlog the same way.

## Implementation details

Fix at the source: emit the user message before any await that lets provider events run.

`desktop/src/actions/agent/agent_run_interactions.js`, `sendStreamingMessage`:

* After pushing the user message and `transitionConversationStatus`, emit `userMessage` and `state` first, then `await service.persistCheckpoint(run)`.
* Keep `streamingAdapter.sendMessage` before the push: a failed write must not leave a user message in the conversation.
* Persist failure handling unchanged (error still propagates to the caller after the events are emitted).

Same reorder in `answerQuestion` and `dismissQuestions`:

* `answerQuestion`: emit `questionAnswered` and `state`, then `await service.persistCheckpoint(run)`.
* `dismissQuestions`: emit `questionDismissed` and `state`, then persist; keep the existing `persistenceError` wrap and throw after the emits.
* Keep the provider call (`answerQuestion` / `dismissQuestion` / `sendMessage` for restored questions) before the push, same reason as above.

With this order `agentUserMessage`, `agentQuestionAnswer` and `agentQuestionDismissed` in `action_run_registry.ts` append at `entries.length`, which then equals desktop index `k`; following `agentEvent` / `agentOutput` at `k+1…` append in order.

Renderer guard, `app/src/services/actions/action_run_registry.ts`, `handleEvent`:

* Wrap the `updateAgentEventAtIndex` call (`agentEvent` branch) and the `updateAgentOutputAtIndex` call (`agentOutput` branch) in `try/catch`.
* On error: `console.error` with run id, entry index and error; keep the previous `conversation` and `conversationChange`. The rest of the event still applies (status, timer, logs), the store still updates, later events still process.
* Effect: one bad index skips only that entry update instead of aborting `handleEvent`. Live bridge listener and the recovery replay loops (`recoverActiveRuns`) no longer stop on such an error.
* Limitation: a skipped entry stays missing in the renderer copy until the next `replace` (`agentStarted` / `agentClosed`). The desktop reorder above prevents the known cause. Chatlog tracker (`action_conversation_chatlog_tracker.ts`) already moves the turn boundary and replaces the queued prompt with the sent message.

Edge cases:

* Agent output arrives between the adapter write and the push (before step 2.2): not possible with current flow; push follows the write in the same microtask chain, provider stdout is handled in a later macrotask.
* Checkpoint write fails: renderer already shows the message; desktop entries also contain it, so both copies stay aligned.

### Tests

`desktop/src/actions/agent/agent_runner_state.test.mjs` (existing `sendMessage` coverage):

* Regression: `persistCheckpoint` is a deferred promise; while it is pending, a provider event is pushed and emitted. Assert emitted order is `userMessage` before that `agentEvent`, and the `agentEvent` `entryIndex` equals user message index + 1.
* Same regression for `answerQuestion` (`questionAnswered` first) and `dismissQuestions` (`questionDismissed` first).
* `dismissQuestions` with failing checkpoint: `questionDismissed` and `state` still emitted, then rejects with `Questions dismissed, but conversation checkpoint could not be saved`.

`app/src/services/actions/action_run_registry.node.test.ts`:

* Feed `agentUserMessage` then `agentEvent` at the next index after a queued prompt; assert run conversation contains both, in order, and queued prompt is removed.
* `agentEvent` and `agentOutput` with out-of-range `entryIndex`: no throw, `console.error` called (spied), conversation unchanged, run status updated; a following valid event is applied.

## Acceptance criteria

* Sending a queued prompt while the agent is busy: after dispatch, the user message and all following agent output appear live in the action-popup chatlog, without finishing or reloading the conversation.
* Same for a prompt sent directly while the agent waits for input.
* Same after answering or dismissing an agent question: the answer / "Questions dismissed" entry and all following agent output appear live.
* No `Conversation entry index out of range` or identity mismatch errors in the renderer console during these flows.
* An invalid entry index in `agentEvent` / `agentOutput` is logged via `console.error`, never thrown out of `handleEvent`; the run keeps updating.
* Desktop emits `userMessage` / `questionAnswered` / `questionDismissed` before any provider event that follows the pushed entry.
* Regression tests above pass.