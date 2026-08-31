---
author: 
id: B_174
internalId: a0687111-dded-4140-8d97-666bd331ddfc
title: queued prompt not working
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__a0687111-dded-4140-8d97-666bd331ddfc.json
policy:
after: cd9535f0-5c2f-4544-a485-c37091c9b3f0
changedFiles:
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
---
claude agent was running. I needed to steer, so entered a new prompt. this got queued and showed up ok on the screen. but as soon as the agent was done and it's output was written, our queued prompt disappeared and the conversation remains in the `completed` state. I don't think our prompt was sent. something appears to be going wrong in the sequence

## Current state

A **queued prompt** is user text accepted by desktop for delivery after active agent turn can receive it. Renderer stores queue snapshot in `ActionRunRegistry` and shows entries at chat bottom. Desktop `ActionRun` owns ordered queue and publishes granular queued, edited, and removed events.

Streaming runs normally dispatch first queued prompt when agent reports `waitingForInput`. However, `executeAgentAction` drains queued follow-ups after successful process completion only when action is non-streaming. If streaming Claude process completes before queued prompt is dispatched, execution returns without consuming queue. `clearActiveAction` then calls `discardQueuedPrompts`, which publishes removal event, so prompt disappears. Agent conversation has already closed as `completed`; action and root run then also complete.

This is desktop finalization bug, not renderer display bug. Existing one-shot continuation already has required follow-up flow: claim next queue entry, continue from previous conversation reference, and delay action completion until follow-up finishes.

## implementation details

- Make successful agent completion drain accepted queued prompts for both streaming and non-streaming actions. A streaming process that remains alive still uses current immediate dispatch when it reports `waitingForInput`.
- Rename `takeNextOneShotPrompt` to describe provider-independent use. It has one verified call site, inside `executeAgentAction`; no compatibility mode is needed.
- After each successful agent execution, atomically do one of two things through existing serialized queue-operation chain: claim oldest queued prompt for dispatch, or close queue when empty. Closing queue means later enqueue requests fail and renderer keeps unsent editor text.
- When prompt is claimed, publish existing `agentPromptRemoved` event, start continuation with prior result `reference` and claimed prompt, then repeat until queue is empty or execution fails. Preserve current FIFO order, placeholder resolution, accumulated stdout/stderr, changed paths, conversation reference, and run id.
- Do not call terminal queue discard before successful follow-ups have drained. Keep current discard behavior for Stop, Finish, cancellation, failed execution, and remaining queue entries after failure.
- Add desktop `ActionRun` regression tests for streaming Claude-style successful process completion with queued prompt, including queue/completion race. Assert follow-up starts once, uses prior reference, removal happens only when claimed, and terminal action/run event occurs after follow-up. Existing renderer queue events and UI require no behavior change.

## acceptance criteria

- When user queues prompt during streaming Claude turn and provider process then completes successfully, queued prompt is sent as continuation exactly once instead of disappearing.
- Conversation does not remain terminal `completed` while accepted follow-up is pending or running. Action and root run complete only after all successfully dispatched follow-ups finish.
- Several queued prompts run one at time in FIFO order for both streaming and non-streaming actions.
- Queue entry disappears from queued UI only when dispatch claims it, user deletes it, or run ends through Stop, Finish, cancellation, or failure.
- Enqueue racing successful completion has deterministic result: prompt accepted before queue closure is dispatched; prompt arriving after closure is rejected and remains in editor.
- Failed follow-up fails action through existing error path and discards later unsent prompts. No prompt is duplicated.
- Existing live streaming dispatch at `waitingForInput`, edit/delete behavior, placeholder resolution, transcript persistence, changed-path aggregation, and action chaining remain unchanged.
