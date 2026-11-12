---
author: 
id: B_361
internalId: d2e9440e-e79e-4abe-9092-d786540e29d3
title: action popup stuck
status: ready
owner: 
affects:
agents:
  - design/activity/card__d2e9440e-e79e-4abe-9092-d786540e29d3.json
policy:
changedFiles:
  - app/src/components/actions/run/state/action_run_binding_store.node.test.ts
  - app/src/data/action_run_types.ts
  - desktop/src/actions/action/action_prompt_queue_closed_error.js
  - desktop/src/actions/action/action_runner_prompt_continuation.test.mjs
  - desktop/src/actions/action/action_runner_service.js
---
We were doing a conversation in an action popup. there were a couple of tasks to complete. the UI appeared as if it was stuck on task 2, and everything was still running.

however, when I tried to send a new prompt, we got:

> Failed to send
> Action run no longer accepts queued prompts: action-ff817ecc-7aa9-4c48-9598-f408510baec0

The ui was clearly in a bad state, the prompt was ready but the UI did not see it. I think something got broken perhaps in recent refactoring?

note: this was with a claude agent

## Current state

The renderer treats a run with status `queued`, `running`, or `waitingForInput` as active and allows another prompt while its agent interaction is ready. The desktop `ActionRun` can already have closed its prompt queue during that time. It closes the queue when the agent executor returns and no prompt is waiting, before tracked-file commits, commit-reference capture, activity persistence, and the terminal run event finish.

A prompt submitted in this interval reaches the old run and fails with `Action run no longer accepts queued prompts`. The popup remains on the last live Claude state because it has not received the terminal event. Claude's task list can therefore still show task 2 as in progress; task status is updated only when Claude emits another task update and is not authoritative for prompt acceptance.

`ActionRunRegistry` already associates a pending submission with both a run ID and the canonical `AgentConversation.id`. However, it currently marks every submission owned by a terminal run as failed. Prompt lifetime is therefore incorrectly limited to one `ActionRun` instead of the conversation being continued.

## Implementation details

- Accept prompts submitted while the current run is closing and keep them queued under `AgentConversation.id`. Do not require the user to wait for finalization or match the backend error text in the renderer.
- Let the desktop action runner route a prompt to the active `ActionRun` while its queue is open. If that run is closing, retain the submission as a deferred continuation and start a successor run for the same action, context, and conversation after the predecessor has finalized.
- Serialize the successor behind the predecessor's tracked-file commit, commit-reference capture, activity persistence, and worktree release. The continuation must use the persisted conversation reference and must not overlap Git or worktree operations from the previous run.
- Preserve the submission ID across the boundary. Publish normal queued and dispatched updates for the successor run so `ActionRunRegistry` can rebind the existing submission instead of creating a duplicate message.
- Change terminal submission reconciliation so a deferred continuation owned by the same `AgentConversation.id` survives the predecessor's terminal event. Fail it only when continuation cannot be started, the conversation identity changes, or the user cancels it.
- Keep `ActionRun` queues run-scoped. Conversation-level routing and deferred ownership belong to the action runner, which owns run creation and completion.
- Apply the behavior to every streaming provider. Claude task-list rendering requires no provider-specific workaround.
- Add focused desktop tests for prompt arrival after the run queue closes, serialized successor startup, identity preservation, and continuation failure. Add renderer service and popup tests proving that the queued message remains visible and is rebound to the successor run without a transient failure.

## Acceptance criteria

- A prompt submitted after the current run stops accepting direct prompts is shown as queued rather than failing with `Action run no longer accepts queued prompts`.
- The user can submit the prompt immediately and does not have to wait for background finalization.
- The queued prompt starts a continuation only after the previous run has completed its persistence, Git, and worktree operations.
- The continuation uses the same `AgentConversation.id`, action, and context.
- The prompt appears once, retains its submission ID, and transitions from queued to dispatched when the successor run accepts it.
- A predecessor terminal event does not fail a deferred continuation.
- If continuation cannot start, the queued prompt changes to a clear failed state and is not silently discarded.
- The behavior works for Claude and other streaming providers without provider-specific queue logic.
