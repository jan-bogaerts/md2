---
author: 
id: F_338
internalId: 48eca8bf-b156-40bb-99cf-134b5d6fa640
title: show questions after agent closed
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__48eca8bf-b156-40bb-99cf-134b5d6fa640.json
policy:
---

When an agent asked a question, we show a box with the questions. this works ok. only problem, when we close the application and open it again (so the agent has stopped), we don't show the questions anymore.

so, when the last message was a `askuserquestion` and the conversation is in the state `waitingforinput`, we should show the question box again.

## Current state

The pending question exists only in the memory of the running agent process. `handleQuestion` in `desktop/src/actions/agent/agent_streaming_event_handlers.js:104` sets `run.waitingForQuestion`, `run.pendingQuestionRequestId` and `run.pendingQuestions` on the live run, moves the conversation to `waitingForInput`, persists a checkpoint, and emits a `question` run event. It never appends a conversation entry, so the checkpoint that reaches the activity file records the `waitingForInput` status but no trace of the questions themselves. The Claude adapter reinforces this: `claudeApprovalRequest` in `desktop/src/actions/agent/agent_claude_streaming_adapter.js:110` returns `null` for the `AskUserQuestion` tool, so the question never becomes a tool-call transcript event either.

On the renderer side the question box is driven purely by that live run event. `app/src/services/actions/action_run_registry.ts:943` stores the emitted questions in `run.question` (a `LiveAgentQuestion`, holding `questions` plus the streaming `requestId`), and `ActionAgentInteraction` in `app/src/components/actions/run/popup/action_agent_interaction.tsx:28` passes `ActionAgentQuestionOwner` to `ActionPromptOwner` only while `run.question` is set. `ActionAgentQuestionOwner` submits through `answerActionQuestion(runId, requestId, answers)`, which reaches `answerQuestion` in `desktop/src/actions/agent/agent_run_interactions.js:53` and writes the answers back over the agent's stdin control protocol.

After the application is closed and reopened, the agent process is gone: no run exists in the registry, `run.question` is `null`, and the `requestId` refers to a control request that no longer exists anywhere. The reopened conversation is loaded from the activity file instead, and the popup already recognises this situation as `orphanWaiting` in `app/src/components/actions/run/popup/action_popup_bottom_row.tsx:88`, meaning no live session but a selected conversation still in status `waitingForInput`. In that state the user can type a free-text prompt, which resumes the stored conversation through `continuationPath` and `continueFrom` in `runWithPrompt` (`app/src/components/actions/run/popup/action_popup_operations.ts:108`). What is missing is the question box: the questions were never persisted, so nothing can be restored, and the user has to guess what the agent asked.

One property of the write path matters for the fix. `upsertConversation` in `desktop/src/actions/activity/activity_files.js:218` pushes every conversation through `parseAgentConversationValue`, and `normalizeEvent` in `shared/agent_conversations.mjs` rebuilds each event entry field by field from a fixed whitelist. Any new entry field that is not added to that normaliser is silently dropped on save.

## Implementation details

**Persist the question as a hidden conversation entry.** In `handleQuestion`, before `persistCheckpoint`, append an event entry of a new type `agentQuestion` that carries the questions. Because event entries have no place for structured data today, extend the entry shape with an optional `questions` array, each item holding `header`, `id`, `isSecret`, `options` and `question`:

- `shared/agent_conversations.mjs`: accept and re-emit `questions` in `normalizeEvent`, validating each item, so the field survives the activity-file round trip; add `agentQuestion` to `INTERNAL_EVENT_TYPES` so the transcript filters the row out. The question box, not a chat bubble, is the visible surface, and a live session shows no such row today.
- `app/src/data/data_types.ts`: add the optional `questions` field to `AgentConversationEvent`.
- Secret questions keep only their metadata. No answer value is ever written into the entry, so this adds no new secret exposure.

**Resolve the entry when the question is resolved.** `answerQuestion` already appends the user's answer message and `dismissQuestions` already appends a `questionsDismissed` event, both ordered after the `agentQuestion` entry. Restoration can therefore read the transcript instead of a separate flag: a question is pending exactly when the last entry of the conversation is that `agentQuestion` entry.

**Restore the box for orphaned waiting conversations.** Add a selector, for example `pendingConversationQuestions(conversation)` next to `app/src/components/actions/conversation/action_conversation_chat_selectors.ts`, returning the `questions` of the trailing `agentQuestion` entry when `conversation.status === 'waitingForInput'` and `null` otherwise. In `ActionAgentInteraction`, when no live run question exists, subscribe to the conversation store and fall back to that selector, marking the restored variant with a `requestId` of `null`. `ActionAgentQuestion` itself needs no change; only its owner branches.

**Answering a restored question resumes the conversation.** In `ActionAgentQuestionOwner`, when the question came from the transcript rather than from a live run, do not call `answerActionQuestion`, because the streaming `requestId` is dead. Compose one line per question in the form `<question text>: <answer>` — the same shape `answerQuestion` writes for live answers, but keyed by question text since the resumed agent does not know md2's synthetic question ids — and submit it through the existing orphan-waiting resume path, that is `runPopupAction` and `runWithPrompt` with `continueFrom` pointing at the stored conversation. The composed text becomes a normal user message in the resumed session, so the agent reads the answer from its own transcript. The prompt draft is cleared on success exactly as it is for a typed prompt.

**Dismissing a restored question persists.** Add a bridge operation, for example `dismissWaitingActionConversationQuestions(reference)`, that appends a `questionsDismissed` event entry to the stored conversation without resuming the agent, mirroring `closeWaitingActivityConversation` in `desktop/src/actions/activity/activity_files.js:311` and rejecting the call when the conversation is no longer `waitingForInput`. It has to be wired through the same chain as the existing close operation: `desktop/src/actions/activity/activity_files.js`, `desktop/src/shell/local_bridge_dispatch.js:469`, the channel list in `desktop/src/shell/preload.js:86`, `app/src/data/electron_action_bridge.ts`, `app/src/services/data/remote_control_storage_service.ts`, and a `defaultDismissWaitingConversationQuestions` in `app/src/components/actions/run/popup/action_popup_defaults.ts`. The returned conversation is pushed into the conversation store with `updateConversation`, so the box disappears immediately and stays gone after a restart.

**Scope.** Only Claude raises `AskUserQuestion` today, but nothing above is Claude-specific: the entry is written from the provider-independent `handleQuestion`, so any future provider that emits a `question` event inherits the same behaviour.

## Acceptance criteria

- While an agent runs, an `AskUserQuestion` request writes an `agentQuestion` entry containing the questions into the conversation, and that entry survives an activity-file save and reload unchanged.
- The `agentQuestion` entry is never rendered as a row in the chat transcript, so a live session looks exactly as it does today.
- Closing the application while a question is pending, reopening it and selecting that conversation shows the same question box, with the same questions, headers and options as before the restart.
- The restored box appears only when the conversation status is `waitingForInput` and the `agentQuestion` entry is the last entry. A conversation that was already answered, dismissed, cancelled, completed or failed shows no box.
- Submitting an answer in the restored box resumes the stored conversation through `continueFrom`, sends the answers as a user message with one `<question text>: <answer>` line per question, and clears the box, after which the agent continues from that answer.
- Dismissing the restored box appends a `questionsDismissed` entry to the stored conversation, the box disappears, and it does not come back after another restart.
- Answering or dismissing a live question behaves exactly as before: the answer still travels over the streaming control protocol and the run's `requestId` path is untouched.
- Secret questions restore without any stored answer value.
