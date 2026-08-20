---
author: 
id: B_150
internalId: 168acbb7-c395-4962-9e69-96ec1fb6a594
title: codex shows incorrect waiting for input
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__168acbb7-c395-4962-9e69-96ec1fb6a594.json
policy:
---
codex appears to sometimes run sub tasks which give different json objects which don't appear to be handled correctly yet.

I think a sub agent reports that it is ready and that our parser then thinks that the entire conversation is already ready, which it isn't. but it puts the action popup in 'waitingForinput' mode.

The agent still seems to be running though, the conversation still grows. tools are still being run, but the action popup is in a wrong state.

we have blocks like 'collaboration:wait'

## Current state

`CodexStreamingAdapter` stores root Codex thread ID, meaning ID of conversation started or resumed for MD2 action. It currently processes every app-server notification without checking notification `threadId`.

During multi-agent work, Codex emits notifications for child threads created by collaboration tools. Child `turn/started` can replace tracked root turn ID. Child `turn/completed` can then clear that ID and emit MD2 `turnCompleted`. `AgentRunnerService` treats that event as end of root turn, changes conversation to `waitingForInput`, and publishes state through action runner to popup. Root thread continues producing messages and tool calls while popup shows wrong state.

`collabAgentToolCall` items such as `wait` belong to root thread and are valid conversation events. They must remain visible.

## Implementation details

- In `desktop/src/actions/agent/agent_streaming_adapter.js`, scope app-server notifications to root thread. A notification is server message with `method` and no request/response lifecycle owned by MD2.
- After root `threadId` is known, ignore any notification carrying different `params.threadId` before it can change active turn, assistant output, tool events, changed paths, usage, or turn completion. Continue handling global notifications that have no `threadId`, such as rate-limit updates.
- Keep root collaboration items. Their notification `threadId` matches root even when `receiverThreadIds` names child threads.
- Do not change `AgentRunnerService`, action event propagation, renderer registry, or popup logic. Those layers already show correct state when adapter emits root events only.
- Add regression coverage in `desktop/src/actions/agent/agent_streaming_adapter.test.mjs` using root and child thread IDs. Update affected Codex notification fixtures to include protocol-required `threadId` and `turnId` values.

## Acceptance criteria

- Given active root turn, child-thread `turn/started`, item, usage, and `turn/completed` notifications emit no MD2 events and do not replace or clear root active turn.
- When child finishes while root waits through collaboration tool, conversation and action remain `running`; popup does not show `waitingForInput` controls.
- Root `collabAgentToolCall` events, including `wait`, still appear and update through normal item lifecycle.
- Root `turn/completed` emits one MD2 `turnCompleted`; only then may existing flow change conversation and popup to `waitingForInput`.
- Existing single-agent Codex turns, root questions and approvals, global rate-limit updates, and Claude streaming behavior remain unchanged.
- Targeted desktop adapter and runner-state tests pass, followed by desktop unit tests and lint.
