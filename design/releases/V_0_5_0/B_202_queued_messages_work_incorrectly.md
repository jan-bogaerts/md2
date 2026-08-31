---
author: 
id: B_202
internalId: 25d602ba-1743-4365-b35d-08224cd0b98e
title: queued messages work incorrectly
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__25d602ba-1743-4365-b35d-08224cd0b98e.json
policy:
changedFiles:
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
after: 66c61696-aa0f-473b-bd5a-e241c64a933f
---

it seems that the system will only try to send the next queued message after the agent fully completed it's turn. it is not possible to send it while the agent is still doing something. we need to fix this.

## Current state

A **steering prompt** is a user message delivered during an active agent turn so the agent can use it before finishing that turn.

`ActionRun` dispatches one queued prompt when a streaming agent becomes active. After sending it, `dispatchStreamingPrompt` sets `activeAgentDispatchAvailable` to false. Another queued prompt cannot dispatch until a later `waitingForInput` event sets the flag true. `AgentRunnerService` emits that event after provider turn completion, checkpoint persistence, and usage recording. Therefore second and later prompts wait even while agent could still accept steering input.

Provider layer already supports active-turn delivery. Codex uses `turn/steer` while root turn id is active; Claude writes another user message to open streaming process. Agent interaction writes and prompt queue operations are already serialized. Bug is `ActionRun` one-prompt-per-turn gate, not renderer, bridge, or provider adapter.

## implementation details

- In `desktop/src/actions/action/action_run.js`, replace turn-bound `activeAgentDispatchAvailable` gate with dispatch eligibility based on active streaming run and absence of pending question or approval.
- Keep each queue operation bounded to one entry. After one successful send, schedule another serialized dispatch when queue still contains entries. This drains FIFO queue during active turn without concurrent provider writes or unbounded loop.
- Keep queue entry removal at claim time and existing delivered-user-message flow. Every claimed prompt passes through placeholder resolution and `AgentRunnerService.sendMessage` exactly once.
- When question or approval is pending, keep all queued prompts visible and unsent. Resume dispatch immediately after matching interaction clears; do not wait for turn completion.
- Preserve successful-completion fallback from B_174: if active process ends before entry is claimed, continue from last conversation reference and drain remaining queue through follow-up executions.
- Keep one-shot actions, queue edit/delete behavior, Stop/Finish/cancellation cleanup, failure handling, action finalization, renderer state, Electron bridge, remote control, and provider adapters unchanged.
- Update `desktop/src/actions/action/action_run.test.mjs`. Cover several prompts queued during active streaming turn, prompt queued while earlier send is in flight, pending-interaction release, FIFO ordering, at-most-once delivery, and process-completion race.

## acceptance criteria

- While streaming agent turn is running, every queued prompt dispatches as steering input as soon as earlier queue operations finish; turn need not complete first.
- Several prompts queued during same active turn reach provider once each and in FIFO order.
- Queue entry remains visible until dispatch claims it. Claimed entry becomes normal persisted user message through existing agent-run path.
- Pending question or approval blocks dispatch but not queueing. After interaction clears, queued prompts dispatch without waiting for `waitingForInput` from turn completion.
- Queue operations and provider writes never overlap. Edit/delete race affects only selected unsent entry; dispatched prompt is never duplicated.
- If streaming process ends before dispatch claim, accepted prompt follows existing continuation path and action completes only after remaining follow-ups finish.
- One-shot delivery, placeholder resolution, queue UI, Stop/Finish/cancellation, failures, conversation persistence, and action chaining retain current behavior.
